import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFile,
  cp,
  mkdtemp,
  rename,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { chromium } from "@playwright/test";
import type { DiagramRecord } from "../src/lib/diagrams/schema";

// Opt-in acceptance, never part of normal setup. Every database is in a new
// temporary Git clone. No live workspace database or credentials are read.
const source = resolve(import.meta.dirname, "..");
const evidence = await mkdtemp(join(tmpdir(), "mefagram-installation-"));
const log = join(evidence, "commands.log");
const env: NodeJS.ProcessEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env))
  if (
    /^(MEFAGRAM_|BETTER_AUTH_|DATABASE_URL$|TEST_DATABASE_URL$|VERCEL|NETLIFY|NODE_ENV$)/.test(
      key,
    )
  )
    delete env[key];
const port = Number(process.env.MEFAGRAM_VERIFY_PORT ?? 3290);
const baseURL = `http://127.0.0.1:${port}`;
const externalDataDir = join(evidence, "external-data");
let server: ChildProcess | undefined;

async function run(
  cwd: string,
  command: string,
  args: string[],
  extra: Record<string, string> = {},
) {
  const child = spawn(command, args, {
    cwd,
    env: { ...env, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => (output += String(data)));
  child.stderr.on("data", (data) => (output += String(data)));
  const code = await new Promise<number | null>((done, reject) => {
    child.once("error", reject);
    child.once("exit", done);
  });
  await appendFile(log, `${command} ${args.join(" ")}\n${output}\n`, {
    mode: 0o600,
  });
  assert.equal(
    code,
    0,
    `${command} failed; see ${log}\n${output.slice(-2000)}`,
  );
  return output.trim();
}

async function clone(name: string, ref: string) {
  const cwd = join(evidence, name);
  await run(evidence, "git", ["clone", "--quiet", "--no-local", source, cwd]);
  await run(cwd, "git", ["checkout", "--quiet", ref]);
  await run(cwd, "npm", ["ci"]);
  return cwd;
}

async function start(cwd: string) {
  server = spawn(
    process.execPath,
    [
      join(cwd, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  server.stdout?.on("data", (data) => (output += String(data)));
  server.stderr?.on("data", (data) => (output += String(data)));
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(server.exitCode, null, `Server exited: ${output}`);
    try {
      if (
        (
          await fetch(`${baseURL}/`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        return;
    } catch {
      /* Wait for our server. */
    }
    await delay(200);
  }
  throw new Error(`Production server did not start: ${output}`);
}

async function stop() {
  if (!server) return;
  const child = server;
  server = undefined;
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((done) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      done();
    });
    child.kill("SIGTERM");
  });
}

async function client() {
  const result = new Client({
    name: "installation-acceptance",
    version: "0.2.0",
  });
  await result.connect(
    new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`)),
  );
  return result;
}
async function call(
  connection: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await connection.callTool({ name, arguments: args });
  assert(
    !result.isError,
    `${name}: ${JSON.stringify(result.structuredContent)}`,
  );
  return result.structuredContent as unknown as DiagramRecord;
}
async function browserRead(record: DiagramRecord, screenshot: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/?diagram=${record.id}`);
    await page
      .getByText("Shared agent record", { exact: true })
      .first()
      .click();
    await page
      .getByRole("complementary", { name: "Node details" })
      .getByText(record.document.nodes[0].notes!, { exact: true })
      .waitFor();
    await page.screenshot({ path: join(evidence, screenshot) });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

// Runs using the clone's own source/dependencies, with its database stopped.
// "prepare" runs on the previous account-based release; "verify" runs on the
// candidate and checks the content moved intact to the local owner.
const prepareScript = `
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { createDatabase } from '../src/lib/db';
import { DiagramService } from '../src/lib/diagrams/service';
const config = parse(await readFile('.env.local'));
const db = await createDatabase({dataDir:resolve(config.MEFAGRAM_DATA_DIR)});
try {
  const owner=(await db.query('SELECT id FROM "user"')).rows[0];
  const service=new DiagramService(db);
  const sample=(await service.list(owner.id))[0];
  await service.patch(owner.id,sample.id,sample.revision,[{op:'update_node',id:'problem',changes:{notes:'Preserved upgrade research'}}],'upgrade-fixture');
  const diagrams=await Promise.all((await service.list(owner.id)).map(async d=>({
    record:await service.get(owner.id,d.id),
    history:(await db.query('SELECT revision,created_at::text AS "createdAt",content,actor,summary FROM diagram_revisions WHERE diagram_id = $1 ORDER BY revision DESC',[d.id])).rows
  })));
  await writeFile('.mefagram/upgrade-snapshot.json',JSON.stringify(diagrams));
} finally {await db.close();}
`;
const verifyScript = `
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { createDatabase } from '../src/lib/db';
import { LOCAL_OWNER } from '../src/lib/db/migrate';
import { DiagramService } from '../src/lib/diagrams/service';
const config = parse(await readFile('.env.local'));
assert.equal(config.BETTER_AUTH_SECRET, undefined);
await assert.rejects(access('.mefagram/local-access.json'));
const db = await createDatabase({dataDir:resolve(config.MEFAGRAM_DATA_DIR)});
try {
  const service=new DiagramService(db);
  const diagrams=await Promise.all((await service.list(LOCAL_OWNER)).map(async d=>({
    record:await service.get(LOCAL_OWNER,d.id),
    history:(await db.query('SELECT revision,created_at::text AS "createdAt",content,actor,summary FROM diagram_revisions WHERE diagram_id = $1 ORDER BY revision DESC',[d.id])).rows
  })));
  assert.deepEqual(diagrams,JSON.parse(await readFile('.mefagram/upgrade-snapshot.json','utf8')));
  console.log('Diagrams and history moved intact to the local owner; old credentials removed.');
} finally {await db.close();}
`;

try {
  const candidate = await run(source, "git", ["rev-parse", "HEAD"]);
  console.log(`Acceptance clones and private logs: ${evidence}`);
  const fresh = await clone("fresh", candidate);
  await run(fresh, "npm", ["run", "setup"], {
    MEFAGRAM_DATA_DIR: externalDataDir,
  });
  await run(fresh, "npm", ["run", "build"]);
  await start(fresh);
  const first = await client();
  const second = await client();
  let saved: DiagramRecord;
  try {
    assert.deepEqual(
      (await first.callTool({ name: "list_diagrams", arguments: {} }))
        .structuredContent,
      { diagrams: [] },
    );
    const created = await call(first, "create_diagram", {
      title: "Shared installation fixture",
      document: {
        schemaVersion: 1,
        nodes: [{ id: "shared", label: "Shared agent record" }],
        edges: [],
      },
      mutationId: crypto.randomUUID(),
    });
    assert.equal(
      (await call(second, "get_diagram", { id: created.id })).revision,
      1,
    );
    const results = await Promise.all(
      [first, second].map((connection, index) =>
        connection.callTool({
          name: "update_diagram",
          arguments: {
            id: created.id,
            expectedRevision: 1,
            operations: [
              {
                op: "update_node",
                id: "shared",
                changes: { notes: `Saved by agent ${index + 1}` },
              },
            ],
            mutationId: crypto.randomUUID(),
          },
        }),
      ),
    );
    assert.equal(results.filter((result) => !result.isError).length, 1);
    assert.match(
      JSON.stringify(results.find((result) => result.isError)),
      /REVISION_CONFLICT/,
    );
    saved = await call(first, "get_diagram", { id: created.id });
    assert.equal(saved.revision, 2);
    assert.deepEqual(
      await call(second, "get_diagram", { id: saved.id }),
      saved,
    );
    await browserRead(saved, "fresh-browser.png");
  } finally {
    await first.close();
    await second.close();
  }
  await stop();
  await start(fresh);
  const restarted = await client();
  try {
    assert.deepEqual(
      await call(restarted, "get_diagram", { id: saved.id }),
      saved,
    );
  } finally {
    await restarted.close();
  }
  await browserRead(saved, "restart-browser.png");
  await stop();
  await cp(join(fresh, ".mefagram"), join(evidence, "backup"), {
    recursive: true,
  });
  await cp(join(fresh, ".env.local"), join(evidence, "backup.env"));
  await cp(externalDataDir, join(evidence, "backup-db"), { recursive: true });
  await rename(
    join(fresh, ".mefagram"),
    join(fresh, ".mefagram-before-restore"),
  );
  await cp(join(evidence, "backup"), join(fresh, ".mefagram"), {
    recursive: true,
  });
  await cp(join(evidence, "backup.env"), join(fresh, ".env.local"));
  await rename(externalDataDir, `${externalDataDir}-before-restore`);
  await cp(join(evidence, "backup-db"), externalDataDir, { recursive: true });
  await start(fresh);
  const restored = await client();
  try {
    assert.deepEqual(
      await call(restored, "get_diagram", { id: saved.id }),
      saved,
    );
  } finally {
    await restored.close();
  }
  await browserRead(saved, "restored-browser.png");
  await stop();
  console.log(
    "Clean clone, empty setup, two HTTP agents, production browser, restart and backup restoration passed.",
  );

  const upgrade = await clone("upgrade", "e557bab");
  await run(upgrade, "npm", ["run", "setup"], {
    MEFAGRAM_OWNER_EMAIL: "upgrade-fixture@example.com",
    BETTER_AUTH_URL: baseURL,
  });
  await writeFile(join(upgrade, ".mefagram/prepare-upgrade.ts"), prepareScript);
  await run(upgrade, "node", [
    "--import",
    "tsx",
    ".mefagram/prepare-upgrade.ts",
  ]);
  await run(upgrade, "git", ["checkout", "--quiet", candidate]);
  await run(upgrade, "npm", ["ci"]);
  await run(upgrade, "npm", ["run", "setup"]);
  await writeFile(join(upgrade, ".mefagram/verify-upgrade.ts"), verifyScript);
  await run(upgrade, "node", [
    "--import",
    "tsx",
    ".mefagram/verify-upgrade.ts",
  ]);
  console.log(
    "Upgrade from the account-based release preserved edited content and revision history.",
  );
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        candidate,
        upgradedFrom: "e557bab",
        cleanClone: true,
        emptySetup: true,
        sharedHttpMcp: true,
        concurrentConflict: true,
        productionBrowser: true,
        processRestart: true,
        backupRestore: true,
        customDataDirectoryBackupRestore: true,
        upgradePreservation: true,
      },
      null,
      2,
    ),
  );
} finally {
  await stop();
}
