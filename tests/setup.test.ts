import { afterAll, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { createDatabase } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { DiagramService } from "@/lib/diagrams/service";

const root = resolve(import.meta.dirname, "..");
const directories: string[] = [];
const cleanEnv: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(MEFAGRAM_|BETTER_AUTH_|DATABASE_URL$|VERCEL)/.test(key),
    ),
  ),
  NODE_ENV: "test",
};

async function directory() {
  const path = await mkdtemp(join(tmpdir(), "mefagram-setup-"));
  directories.push(path);
  return path;
}

async function setup(
  cwd: string,
  args: string[] = [],
  env: Record<string, string> = {},
) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      fileURLToPath(import.meta.resolve("tsx")),
      join(root, "scripts/setup.ts"),
      ...args,
    ],
    {
      cwd,
      env: {
        ...cleanEnv,
        TSX_TSCONFIG_PATH: join(root, "tsconfig.json"),
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  return { code, output };
}

async function saved(cwd: string) {
  return { config: parse(await readFile(join(cwd, ".env.local"))) };
}

afterAll(async () => {
  for (const cwd of directories)
    await rm(cwd, { recursive: true, force: true });
});

describe("portable setup through the real CLI", () => {
  test("creates an empty private workspace with generic defaults and no credentials", async () => {
    const cwd = await directory();
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const { config } = await saved(cwd);
    expect(config).toEqual({ MEFAGRAM_DATA_DIR: ".mefagram/db" });
    const db = await createDatabase({
      dataDir: join(cwd, config.MEFAGRAM_DATA_DIR),
    });
    try {
      expect(await new DiagramService(db).list(LOCAL_OWNER)).toEqual([]);
      expect(
        (await db.query("SELECT to_regclass('personal_tokens') AS t")).rows[0].t,
      ).toBeNull();
    } finally {
      await db.close();
    }
    expect((await stat(join(cwd, ".env.local"))).mode & 0o777).toBe(0o600);
    await expect(
      stat(join(cwd, ".mefagram/local-access.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("persists environment-only storage settings", async () => {
    const cwd = await directory();
    const result = await setup(cwd, [], {
      MEFAGRAM_DATA_DIR: ".mefagram/custom database",
    });
    expect(result).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config.MEFAGRAM_DATA_DIR).toBe(
      ".mefagram/custom database",
    );
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config.MEFAGRAM_DATA_DIR).toBe(
      ".mefagram/custom database",
    );
    await stat(join(cwd, ".mefagram/custom database"));
  });

  test("moves an account-based workspace to the local owner without losing content, history or retries", async () => {
    const cwd = await directory();
    const dataDir = join(cwd, ".mefagram/db");
    await mkdir(dataDir, { recursive: true });
    // Recreate the state left by a 0.1.x install: diagrams owned by a signed-in
    // user, a personal token table and the old secrets/credentials files.
    const legacy = await createDatabase({ dataDir });
    const legacyOwner = "legacy-user-id";
    let created;
    let edited;
    try {
      await legacy.query(
        "DELETE FROM mefagram_migrations WHERE id = 'local-owner-v1'",
      );
      await legacy.query(
        "CREATE TABLE personal_tokens (id TEXT PRIMARY KEY, token_hash TEXT)",
      );
      const service = new DiagramService(legacy);
      created = await service.create(
        legacyOwner,
        {
          title: "Account-era map",
          document: {
            schemaVersion: 1,
            nodes: [{ id: "kept", label: "Kept node" }],
            edges: [],
          },
        },
        "legacy-create",
      );
      edited = await service.patch(
        legacyOwner,
        created.id,
        1,
        [{ op: "update_node", id: "kept", changes: { notes: "Mine" } }],
        "legacy-edit",
      );
    } finally {
      await legacy.close();
    }
    await writeFile(
      join(cwd, ".env.local"),
      "BETTER_AUTH_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=old-secret-old-secret-old-secret-old\nMEFAGRAM_SETUP_KEY=old-setup-key-old-setup-key-old-setup\nMEFAGRAM_OWNER_EMAIL=owner@mefagram.local\nMEFAGRAM_DATA_DIR=.mefagram/db\nCUSTOM_SETTING=keep-me\n",
    );
    await writeFile(
      join(cwd, ".mefagram/local-access.json"),
      JSON.stringify({ email: "owner@mefagram.local", password: "old" }),
    );
    const result = await setup(cwd);
    expect(result).toMatchObject({ code: 0 });
    expect(result.output).toContain("Removed obsolete credentials file");
    expect((await saved(cwd)).config).toEqual({
      MEFAGRAM_DATA_DIR: ".mefagram/db",
      CUSTOM_SETTING: "keep-me",
    });
    await expect(
      stat(join(cwd, ".mefagram/local-access.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const db = await createDatabase({ dataDir });
    try {
      const service = new DiagramService(db);
      expect(await service.get(LOCAL_OWNER, created.id)).toEqual(edited);
      expect(await service.revisions(LOCAL_OWNER, created.id)).toHaveLength(2);
      // An agent retrying a request from before the upgrade gets its
      // original result instead of a duplicate.
      expect(
        await service.patch(
          LOCAL_OWNER,
          created.id,
          1,
          [{ op: "update_node", id: "kept", changes: { notes: "Mine" } }],
          "legacy-edit",
        ),
      ).toEqual(edited);
      expect(await service.list(legacyOwner)).toEqual([]);
      expect(
        (await db.query("SELECT to_regclass('personal_tokens') AS t")).rows[0].t,
      ).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("adds the optional sample once and preserves edited records and history on repeat setup", async () => {
    const cwd = await directory();
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const before = await saved(cwd);
    const empty = await createDatabase({
      dataDir: join(cwd, before.config.MEFAGRAM_DATA_DIR),
    });
    try {
      expect((await empty.query("SELECT id FROM diagrams")).rows).toEqual([]);
    } finally {
      await empty.close();
    }
    expect(await setup(cwd, ["--example", "newsletter"])).toMatchObject({
      code: 0,
    });
    const db = await createDatabase({
      dataDir: join(cwd, before.config.MEFAGRAM_DATA_DIR),
    });
    let id = "";
    const ownerId = LOCAL_OWNER;
    try {
      const service = new DiagramService(db);
      const maps = await service.list(ownerId);
      expect(maps).toHaveLength(1);
      expect(maps[0].title).toBe("Relay newsletter workflow");
      id = maps[0].id;
      await service.patch(
        ownerId,
        id,
        1,
        [
          {
            op: "update_node",
            id: "ideas",
            changes: { notes: "Preserve my own research." },
          },
        ],
        "customize-sample",
      );
    } finally {
      await db.close();
    }
    expect(await setup(cwd, ["--example", "newsletter"])).toMatchObject({
      code: 0,
    });
    expect(await saved(cwd)).toEqual(before);
    const reopened = await createDatabase({
      dataDir: join(cwd, before.config.MEFAGRAM_DATA_DIR),
    });
    try {
      const service = new DiagramService(reopened);
      expect(await service.list(ownerId)).toHaveLength(1);
      const map = await service.get(ownerId, id);
      expect(map.revision).toBe(2);
      expect(
        map.document.nodes.find((node) => node.id === "ideas")?.notes,
      ).toBe("Preserve my own research.");
      expect(await service.revisions(ownerId, id)).toHaveLength(2);
    } finally {
      await reopened.close();
    }
  }, 60_000);

  test("keeps an edited legacy sample when its old setup option is repeated after an upgrade", async () => {
    const cwd = await directory();
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const before = await saved(cwd);
    const db = await createDatabase({
      dataDir: join(cwd, before.config.MEFAGRAM_DATA_DIR),
    });
    const ownerId = LOCAL_OWNER;
    let id = "";
    try {
      const service = new DiagramService(db);
      const original = await service.create(
        ownerId,
        {
          title: "My existing sample",
          document: {
            schemaVersion: 1,
            nodes: [{ id: "legacy", label: "Keep my own workflow" }],
            edges: [],
          },
        },
        "initial-mefa-apps-template-v1",
      );
      id = original.id;
      await service.patch(
        ownerId,
        id,
        1,
        [
          {
            op: "update_node",
            id: "legacy",
            changes: { notes: "My existing notes" },
          },
        ],
        "legacy-customization",
      );
    } finally {
      await db.close();
    }
    expect(await setup(cwd, ["--example", "mefa-apps"])).toMatchObject({
      code: 0,
    });
    const reopened = await createDatabase({
      dataDir: join(cwd, before.config.MEFAGRAM_DATA_DIR),
    });
    try {
      const service = new DiagramService(reopened);
      expect(await service.list(ownerId)).toHaveLength(1);
      const record = await service.get(ownerId, id);
      expect(record.document.nodes[0].notes).toBe("My existing notes");
      expect(record.revision).toBe(2);
      expect(await service.revisions(ownerId, id)).toHaveLength(2);
      expect(await saved(cwd)).toEqual(before);
    } finally {
      await reopened.close();
    }
  });

  test("bootstraps from the public example environment and preserves unrelated settings", async () => {
    const cwd = await directory();
    await writeFile(
      join(cwd, ".env.local"),
      (await readFile(join(root, ".env.example"), "utf8")) +
        "\nCUSTOM_SETTING=keep-me\n",
    );
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config).toEqual({
      MEFAGRAM_DATA_DIR: ".mefagram/db",
      CUSTOM_SETTING: "keep-me",
    });
  });

  test("documents options without creating a database and rejects invalid options", async () => {
    const cwd = await directory();
    const help = await setup(cwd, ["--help"]);
    expect(help).toMatchObject({ code: 0 });
    expect(help.output).toContain("--example");
    await expect(stat(join(cwd, ".mefagram"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await setup(cwd, ["--example", "unknown"])).code).not.toBe(0);
    expect((await setup(cwd, ["--email", "removed@example.com"])).code).not.toBe(0);
    await expect(stat(join(cwd, ".env.local"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("keeps literal dollar signs and backslashes consistent with Next.js environment loading", async () => {
    const cwd = await directory();
    const dataDir = ".mefagram/$cache\\records";
    expect(
      await setup(cwd, [], { MEFAGRAM_DATA_DIR: dataDir }),
    ).toMatchObject({ code: 0 });
    const output: string[] = [];
    const child = spawn(
      process.execPath,
      [
        "-e",
        "const m=require(process.argv[1]);const r=m.loadEnvConfig(process.argv[2]);console.log(JSON.stringify({dataDir:r.combinedEnv.MEFAGRAM_DATA_DIR}));",
        fileURLToPath(import.meta.resolve("@next/env")),
        cwd,
      ],
      { env: { ...cleanEnv, NODE_ENV: "production" } },
    );
    child.stdout.on("data", (data) => output.push(String(data)));
    await new Promise<void>((done, reject) => {
      child.on("exit", (code) =>
        code === 0
          ? done()
          : reject(new Error("Runtime environment load failed.")),
      );
      child.on("error", reject);
    });
    expect(JSON.parse(output.join("").trim())).toEqual({ dataDir });
    expect(await setup(cwd)).toMatchObject({ code: 0 });
  });

  test("preserves saved settings also supplied by the shell and drops obsolete ones", async () => {
    const cwd = await directory();
    await writeFile(
      join(cwd, ".env.local"),
      "CUSTOM_SETTING=saved-value\nMEFAGRAM_REQUIRE_DATABASE_URL=true\n",
    );
    expect(
      await setup(cwd, [], { CUSTOM_SETTING: "shell-value" }),
    ).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config).toEqual({
      CUSTOM_SETTING: "shell-value",
      MEFAGRAM_DATA_DIR: ".mefagram/db",
    });
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config.CUSTOM_SETTING).toBe("shell-value");
  });
});
