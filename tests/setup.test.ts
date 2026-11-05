import { afterAll, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { createDatabase } from "@/lib/db";
import { createAuth } from "@/lib/auth/server";
import { PersonalTokenService } from "@/lib/auth/tokens";
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
  const config = parse(await readFile(join(cwd, ".env.local")));
  const access = JSON.parse(
    await readFile(join(cwd, ".mefagram/local-access.json"), "utf8"),
  );
  return { config, access };
}

afterAll(async () => {
  for (const cwd of directories)
    await rm(cwd, { recursive: true, force: true });
});

describe("portable setup through the real CLI", () => {
  test("creates an empty private workspace with generic defaults and usable credentials", async () => {
    const cwd = await directory();
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const { config, access } = await saved(cwd);
    expect(access.email).toBe("owner@mefagram.local");
    expect(config.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    const db = await createDatabase({
      dataDir: join(cwd, config.MEFAGRAM_DATA_DIR),
    });
    try {
      const owners = await db.query('SELECT id, name, email FROM "user"');
      expect(owners.rows).toHaveLength(1);
      expect(owners.rows[0]).toMatchObject({
        name: "Mefagram owner",
        email: access.email,
      });
      expect(
        await new DiagramService(db).list(owners.rows[0].id as string),
      ).toEqual([]);
      expect(
        (await new PersonalTokenService(db).verify(access.agentToken))?.userId,
      ).toBe(owners.rows[0].id);
      const auth = createAuth(db, {
        baseURL: access.baseURL,
        secret: config.BETTER_AUTH_SECRET,
        setupKey: config.MEFAGRAM_SETUP_KEY,
        ownerEmail: access.email,
      });
      const signedIn = await auth.api.signInEmail({
        body: { email: access.email, password: access.password },
      });
      expect(signedIn.user.id).toBe(owners.rows[0].id);
    } finally {
      await db.close();
    }
    for (const path of [".env.local", ".mefagram/local-access.json"])
      expect((await stat(join(cwd, path))).mode & 0o777).toBe(0o600);
  });

  test("accepts explicit identity options and persists environment-only storage settings", async () => {
    const cwd = await directory();
    const result = await setup(
      cwd,
      ["--name", "Alex Example", "--email", "ALEX@example.com"],
      {
        MEFAGRAM_OWNER_NAME: "Environment default",
        MEFAGRAM_OWNER_EMAIL: "environment@example.com",
        MEFAGRAM_DATA_DIR: ".mefagram/custom database",
        BETTER_AUTH_URL: "http://localhost:3210",
      },
    );
    expect(result).toMatchObject({ code: 0 });
    const { config, access } = await saved(cwd);
    expect(config.MEFAGRAM_DATA_DIR).toBe(".mefagram/custom database");
    expect(config.MEFAGRAM_OWNER_EMAIL).toBe("alex@example.com");
    expect(config.MEFAGRAM_OWNER_NAME).toBe("Alex Example");
    expect(access.baseURL).toBe("http://localhost:3210");
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const db = await createDatabase({
      dataDir: join(cwd, config.MEFAGRAM_DATA_DIR),
    });
    try {
      expect((await db.query('SELECT name, email FROM "user"')).rows).toEqual([
        { name: "Alex Example", email: "alex@example.com" },
      ]);
    } finally {
      await db.close();
    }
  });

  test("adds the optional sample once and preserves edited records, history and credentials on repeat setup", async () => {
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
    let ownerId = "";
    try {
      ownerId = (await db.query('SELECT id FROM "user"')).rows[0].id as string;
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
      expect(
        await new PersonalTokenService(reopened).list(ownerId),
      ).toHaveLength(1);
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
    let ownerId = "";
    let id = "";
    try {
      ownerId = (await db.query('SELECT id FROM "user"')).rows[0].id as string;
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

  test("refuses a different owner without rewriting working configuration or credentials", async () => {
    const cwd = await directory();
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const before = await saved(cwd);
    const fileBefore = await readFile(join(cwd, ".env.local"), "utf8");
    const result = await setup(cwd, [], {
      MEFAGRAM_OWNER_EMAIL: "different@example.com",
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("different owner");
    expect(await saved(cwd)).toEqual(before);
    expect(await readFile(join(cwd, ".env.local"), "utf8")).toBe(fileBefore);
  });

  test("bootstraps from the public example environment and preserves unrelated settings", async () => {
    const cwd = await directory();
    await writeFile(
      join(cwd, ".env.local"),
      (await readFile(join(root, ".env.example"), "utf8")) +
        "\nCUSTOM_SETTING=keep-me\n",
    );
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    const { config } = await saved(cwd);
    expect(config.BETTER_AUTH_SECRET).not.toContain("replace");
    expect(config.MEFAGRAM_SETUP_KEY).not.toContain("replace");
    expect(config.CUSTOM_SETTING).toBe("keep-me");
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
    expect((await setup(cwd, ["--email", "invalid-email"])).code).not.toBe(0);
    await expect(stat(join(cwd, ".env.local"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  test("keeps literal dollar signs and backslashes consistent with Next.js environment loading", async () => {
    const cwd = await directory();
    const dataDir = ".mefagram/$cache\\records";
    const name = 'Alex "$owner"';
    expect(
      await setup(cwd, [], {
        MEFAGRAM_DATA_DIR: dataDir,
        MEFAGRAM_OWNER_NAME: name,
      }),
    ).toMatchObject({ code: 0 });
    const output: string[] = [];
    const child = spawn(
      process.execPath,
      [
        "-e",
        "const m=require(process.argv[1]);const r=m.loadEnvConfig(process.argv[2]);console.log(JSON.stringify({name:r.combinedEnv.MEFAGRAM_OWNER_NAME,dataDir:r.combinedEnv.MEFAGRAM_DATA_DIR}));",
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
    expect(JSON.parse(output.join("").trim())).toEqual({ name, dataDir });
    expect(await setup(cwd)).toMatchObject({ code: 0 });
  });

  test("preserves saved settings also supplied by the shell and persists the stateless guard", async () => {
    const cwd = await directory();
    await writeFile(
      join(cwd, ".env.local"),
      "CUSTOM_SETTING=saved-value\nMEFAGRAM_REQUIRE_DATABASE_URL=true\n",
    );
    expect(
      await setup(cwd, [], {
        CUSTOM_SETTING: "shell-value",
        MEFAGRAM_REQUIRE_DATABASE_URL: "true",
      }),
    ).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config).toMatchObject({
      CUSTOM_SETTING: "shell-value",
      MEFAGRAM_REQUIRE_DATABASE_URL: "true",
    });
    expect(await setup(cwd)).toMatchObject({ code: 0 });
    expect((await saved(cwd)).config).toMatchObject({
      CUSTOM_SETTING: "shell-value",
      MEFAGRAM_REQUIRE_DATABASE_URL: "true",
    });
    const envOnly = await directory();
    expect(
      await setup(envOnly, [], { MEFAGRAM_REQUIRE_DATABASE_URL: "true" }),
    ).toMatchObject({ code: 0 });
    expect((await saved(envOnly)).config.MEFAGRAM_REQUIRE_DATABASE_URL).toBe(
      "true",
    );
  });
});
