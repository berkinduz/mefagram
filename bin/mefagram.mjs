#!/usr/bin/env node
// Mefagram command line: run the local workspace, bridge MCP over stdio for
// agents, and move diagrams between the workspace and a repository.
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.MEFAGRAM_HOME ?? join(homedir(), ".mefagram");
const require = createRequire(import.meta.url);

const HELP = `Mefagram: diagrams your agents can edit

Usage: mefagram <command> [options]

  start              Run the workspace (foreground). --background to detach.
  stop               Stop a background workspace.
  status             Show whether the workspace is running.
  open [diagram-id]  Open the workspace in your browser.
  mcp                MCP over stdio for agents; starts the workspace if needed.
  export <dir>       Write diagrams to <dir> as .mefagram.json, .mmd and .svg.
                     --project <name> limits to one project.
  import <file>      Import a .mefagram.json export or a Mermaid .mmd file.

Options: --port <n> (default 4747, or MEFAGRAM_PORT)

Add to Claude Code:  claude mcp add mefagram -- npx -y mefagram mcp
Add to Codex:        codex mcp add mefagram -- npx -y mefagram mcp
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string" },
    background: { type: "boolean" },
    project: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});
const command = positionals[0];
const port = Number(values.port ?? process.env.MEFAGRAM_PORT ?? 4747);
const base = `http://127.0.0.1:${port}`;
const log = (...parts) => console.error(...parts);

async function probe() {
  try {
    const response = await fetch(`${base}/api/status`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && typeof body.mcpUrl === "string") return { up: true };
    return { up: false, error: body.code === "DATABASE_IN_USE" ? body.error : undefined };
  } catch {
    return { up: false };
  }
}
const running = async () => (await probe()).up;

/** Environment for the server: an installed package keeps data in ~/.mefagram. */
function serverEnv() {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  const checkoutConfig = join(root, ".env.local");
  if (!env.MEFAGRAM_DATA_DIR && !existsSync(checkoutConfig))
    env.MEFAGRAM_DATA_DIR = join(home, "db");
  return env;
}

function nextBin() {
  return require.resolve("next/dist/bin/next", { paths: [root] });
}

async function ensureBuilt() {
  if (existsSync(join(root, ".next", "BUILD_ID"))) return linkExternals();
  log("Building Mefagram for the first run…");
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, [nextBin(), "build"], {
      cwd: root,
      env: serverEnv(),
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("exit", (code) =>
      code === 0 ? done() : fail(new Error("Build failed.")),
    );
  });
  linkExternals();
}

/** Directory of an installed package, searching node_modules up from root. */
function packageDir(name) {
  for (let dir = root; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/** Recreate Turbopack's external package links for this installation. */
function linkExternals() {
  const manifest = join(root, ".next", "external-modules.json");
  if (!existsSync(manifest)) return;
  const links = JSON.parse(readFileSync(manifest, "utf8"));
  for (const [link, name] of Object.entries(links)) {
    const path = join(root, ".next", "node_modules", link);
    if (existsSync(join(path, "package.json"))) continue;
    const target = packageDir(name);
    if (!target) throw new Error(`Missing dependency ${name}. Reinstall Mefagram.`);
    try {
      lstatSync(path);
      rmSync(path, { force: true, recursive: true });
    } catch {
      /* Not there yet. */
    }
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
  }
}

function serverArgs() {
  return [nextBin(), "start", "--hostname", "127.0.0.1", "--port", String(port)];
}

const pidFile = () => join(home, `server-${port}.pid`);

async function startBackground() {
  if (await running()) return;
  await ensureBuilt();
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const output = openSync(join(home, `server-${port}.log`), "a");
  const child = spawn(process.execPath, serverArgs(), {
    cwd: root,
    env: serverEnv(),
    detached: true,
    stdio: ["ignore", output, output],
  });
  writeFileSync(pidFile(), String(child.pid), { mode: 0o600 });
  child.unref();
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await probe();
    if (state.up) return;
    if (state.error) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
      rmSync(pidFile(), { force: true });
      throw new Error(state.error);
    }
    if (child.exitCode !== null) break;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(
    `Mefagram did not start on port ${port}. See ${join(home, `server-${port}.log`)}.`,
  );
}

async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status}).`);
  }
  return response;
}

/**
 * Stdio <-> Streamable HTTP bridge. The workspace's MCP endpoint is stateless,
 * so every JSON-RPC message is one POST; responses (JSON or SSE) go to stdout.
 */
async function bridge() {
  await startBackground();
  const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  let session;
  let protocol;
  const forward = async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return write({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
    }
    try {
      if (!(await running())) await startBackground();
      const response = await fetch(`${base}/api/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(session ? { "mcp-session-id": session } : {}),
          ...(protocol ? { "mcp-protocol-version": protocol } : {}),
        },
        body: line,
      });
      session = response.headers.get("mcp-session-id") ?? session;
      const type = response.headers.get("content-type") ?? "";
      const text = await response.text();
      if (type.includes("text/event-stream")) {
        for (const event of text.split(/\r?\n\r?\n/)) {
          const data = event
            .split(/\r?\n/)
            .filter((row) => row.startsWith("data:"))
            .map((row) => row.slice(5).trimStart())
            .join("\n");
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed?.result?.protocolVersion) protocol = parsed.result.protocolVersion;
            write(parsed);
          }
        }
      } else if (text.trim()) {
        const parsed = JSON.parse(text);
        if (parsed?.result?.protocolVersion) protocol = parsed.result.protocolVersion;
        if (parsed.jsonrpc) write(parsed);
        else if (message.id !== undefined)
          write({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32603, message: parsed.error ?? "Mefagram error" },
          });
      }
    } catch (error) {
      if (message?.id !== undefined)
        write({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: `Mefagram is not reachable: ${error instanceof Error ? error.message : error}`,
          },
        });
    }
  };
  const lines = createInterface({ input: process.stdin });
  const pending = new Set();
  for await (const line of lines) {
    if (!line.trim()) continue;
    const task = forward(line).finally(() => pending.delete(task));
    pending.add(task);
  }
  await Promise.all(pending);
}

const slug = (value) =>
  value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80) || "diagram";

async function exportTo(dir) {
  if (!(await running()))
    throw new Error(`Mefagram is not running on port ${port}. Run mefagram start first.`);
  const query = values.project
    ? `?project=${encodeURIComponent(values.project)}`
    : "";
  const diagrams = await (await api(`/api/diagrams${query}`)).json();
  await mkdir(dir, { recursive: true });
  const used = new Set();
  for (const diagram of diagrams) {
    let name = slug(diagram.title);
    for (let index = 2; used.has(name); index++) name = `${slug(diagram.title)}-${index}`;
    used.add(name);
    const path = (extension) => join(dir, `${name}${extension}`);
    const exported = await (await api(`/api/diagrams/${diagram.id}/export`)).json();
    await writeFile(path(".mefagram.json"), `${JSON.stringify(exported, null, 2)}\n`);
    await writeFile(
      path(".mmd"),
      await (await api(`/api/diagrams/${diagram.id}/export?format=mermaid`)).text(),
    );
    await writeFile(
      path(".svg"),
      await (await api(`/api/diagrams/${diagram.id}/export?format=svg`)).text(),
    );
    log(`  ${name}  (${diagram.title}, revision ${diagram.revision})`);
  }
  log(`Exported ${diagrams.length} diagram(s) to ${dir}.`);
}

async function importFile(file) {
  if (!(await running()))
    throw new Error(`Mefagram is not running on port ${port}. Run mefagram start first.`);
  const text = await readFile(file, "utf8");
  const body = text.trim().startsWith("{")
    ? JSON.parse(text)
    : {
        format: "mermaid-source",
        mermaid: text,
        ...(/^\s*---/.test(text)
          ? {}
          : { title: basename(file).replace(/\.[^.]+$/, "") }),
      };
  const saved = await (
    await api("/api/diagrams/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `cli-import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify(body),
    })
  ).json();
  log(`Imported "${saved.title}": ${base}/?diagram=${saved.id}`);
}

function openBrowser(url) {
  const opener =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
}

try {
  if (!command || values.help || command === "help") {
    process.stdout.write(HELP);
  } else if (command === "start") {
    if (await running()) log(`Mefagram is already running at ${base}`);
    else if (values.background) {
      await startBackground();
      log(`Mefagram is running at ${base}`);
    } else {
      await ensureBuilt();
      const child = spawn(process.execPath, serverArgs(), {
        cwd: root,
        env: serverEnv(),
        stdio: "inherit",
      });
      for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, () => child.kill(signal));
      child.on("exit", (code) => process.exit(code ?? 0));
    }
  } else if (command === "stop") {
    const file = pidFile();
    if (!existsSync(file)) log("No background Mefagram server was started on this port.");
    else {
      const pid = Number(readFileSync(file, "utf8"));
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* Already stopped. */
        }
      }
      rmSync(file, { force: true });
      log("Stopped Mefagram.");
    }
  } else if (command === "status") {
    const up = await running();
    process.stdout.write(
      up ? `Mefagram is running at ${base}\nMCP: ${base}/api/mcp\n` : `Mefagram is not running on port ${port}.\n`,
    );
    process.exitCode = up ? 0 : 1;
  } else if (command === "open") {
    await startBackground();
    openBrowser(positionals[1] ? `${base}/?diagram=${encodeURIComponent(positionals[1])}` : base);
  } else if (command === "mcp") {
    await bridge();
  } else if (command === "export") {
    if (!positionals[1]) throw new Error("Usage: mefagram export <dir> [--project name]");
    await exportTo(resolve(positionals[1]));
  } else if (command === "import") {
    if (!positionals[1]) throw new Error("Usage: mefagram import <file>");
    await importFile(resolve(positionals[1]));
  } else {
    throw new Error(`Unknown command "${command}". Run mefagram --help.`);
  }
} catch (error) {
  log(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
