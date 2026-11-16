import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readEnvironment, serializeEnvironment } from "./env-file";
import { createDatabase } from "../src/lib/db";
import { LOCAL_OWNER } from "../src/lib/db/migrate";
import { DiagramService } from "../src/lib/diagrams/service";
import { newsletterTemplate } from "../src/lib/diagrams/seed";

const { values } = parseArgs({
  options: {
    example: { type: "string" },
    help: { type: "boolean", short: "h" },
    e2e: { type: "boolean" },
  },
});
if (values.help) {
  console.log(`Mefagram local workspace setup

  npm run setup
  npm run setup -- --example newsletter

Creates or upgrades the local database. New workspaces start empty; the
example is optional and is never reset. Mefagram has no accounts: it only
accepts requests addressed to this computer.
Environment: MEFAGRAM_DATA_DIR (default .mefagram/db), DATABASE_URL.
Stop the local app before running setup.`);
  process.exit(0);
}
if (values.example && !["newsletter", "mefa-apps"].includes(values.example))
  throw new Error("Unknown example. Available: newsletter.");

async function optionalFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// Settings from the former account-based releases. They no longer do anything.
const OBSOLETE_SETTINGS = [
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "MEFAGRAM_SETUP_KEY",
  "MEFAGRAM_OWNER_EMAIL",
  "MEFAGRAM_OWNER_NAME",
  "MEFAGRAM_REQUIRE_DATABASE_URL",
];

const testMode = values.e2e ?? false;
const envFile = testMode ? ".mefagram/e2e.env" : ".env.local";
const existing = readEnvironment((await optionalFile(envFile)) ?? "", envFile);
const setting = (key: string) => process.env[key] ?? existing[key];
const config: Record<string, string> = Object.fromEntries(
  Object.entries(existing).filter(([key]) => !OBSOLETE_SETTINGS.includes(key)),
);
config.MEFAGRAM_DATA_DIR = testMode
  ? ".mefagram/e2e-db"
  : setting("MEFAGRAM_DATA_DIR") || ".mefagram/db";
if (!testMode && setting("DATABASE_URL"))
  config.DATABASE_URL = setting("DATABASE_URL")!;

await mkdir(".mefagram", { recursive: true, mode: 0o700 });
const db = await createDatabase({
  dataDir: resolve(config.MEFAGRAM_DATA_DIR),
  databaseUrl: testMode ? undefined : config.DATABASE_URL,
});
try {
  await writeFile(envFile, serializeEnvironment(config), { mode: 0o600 });
  await chmod(envFile, 0o600);
  // Sign-in passwords and agent tokens from older releases are obsolete.
  const accessFile = testMode
    ? ".mefagram/e2e-access.json"
    : ".mefagram/local-access.json";
  if (await optionalFile(accessFile)) {
    await rm(accessFile);
    console.log(`Removed obsolete credentials file ${accessFile}.`);
  }
  if (values.example) {
    // The old flag must preserve a previously created/edited sample even when
    // the bundled public example changes. Never reuse its mutation ID with
    // different content or reset the owner's original diagram.
    const legacy =
      values.example === "mefa-apps"
        ? await db.query(
            "SELECT mutation_key FROM diagram_mutations WHERE owner_id = $1 AND mutation_key = $2",
            [LOCAL_OWNER, "initial-mefa-apps-template-v1"],
          )
        : { rows: [] };
    if (!legacy.rows.length)
      await new DiagramService(db, "setup").create(
        LOCAL_OWNER,
        newsletterTemplate(),
        "initial-newsletter-template-v1",
      );
  }
  console.log(
    `Mefagram ${testMode ? "test" : db.mode} workspace ready. Start it with npm run dev or npm run build && npm start.`,
  );
} finally {
  await db.close();
}
