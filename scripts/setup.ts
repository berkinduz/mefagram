import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readEnvironment, serializeEnvironment } from "./env-file";
import { z } from "zod";
import { createDatabase } from "../src/lib/db";
import { createAuth } from "../src/lib/auth/server";
import { PersonalTokenService } from "../src/lib/auth/tokens";
import { DiagramService } from "../src/lib/diagrams/service";
import { mefaAppsTemplate } from "../src/lib/diagrams/seed";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    example: { type: "string" },
    help: { type: "boolean", short: "h" },
    e2e: { type: "boolean" },
  },
});
if (values.help) {
  console.log(`Mefagram private workspace setup

  npm run setup
  npm run setup -- --name "Your name" --email you@example.com
  npm run setup -- --example mefa-apps

New workspaces start empty. The example is optional and is never reset.
--name and --email configure a new owner; existing accounts are preserved.
Environment: MEFAGRAM_OWNER_NAME, MEFAGRAM_OWNER_EMAIL, MEFAGRAM_DATA_DIR,
BETTER_AUTH_URL, BETTER_AUTH_SECRET, MEFAGRAM_SETUP_KEY, DATABASE_URL.
Stop the local app before running setup. Credentials stay in .mefagram/.`);
  process.exit(0);
}
if (values.example && values.example !== "mefa-apps")
  throw new Error("Unknown example. Available: mefa-apps.");

async function optionalFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const testMode = values.e2e ?? false;
const envFile = testMode ? ".mefagram/e2e.env" : ".env.local";
const existing = readEnvironment((await optionalFile(envFile)) ?? "", envFile);
const setting = (key: string) => process.env[key] ?? existing[key];
const ownerName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .parse(
    testMode
      ? "Test workspace"
      : (values.name ?? setting("MEFAGRAM_OWNER_NAME") ?? "Mefagram owner"),
  );
const config = {
  ...existing,
  MEFAGRAM_OWNER_NAME: ownerName,
  BETTER_AUTH_URL: testMode
    ? "http://127.0.0.1:3100"
    : (setting("BETTER_AUTH_URL") || "http://127.0.0.1:3000").replace(
        /\/$/,
        "",
      ),
  BETTER_AUTH_SECRET:
    setting("BETTER_AUTH_SECRET") || randomBytes(40).toString("base64url"),
  MEFAGRAM_SETUP_KEY:
    setting("MEFAGRAM_SETUP_KEY") || randomBytes(32).toString("hex"),
  MEFAGRAM_OWNER_EMAIL: testMode
    ? "test@mefagram.local"
    : z
        .email()
        .parse(
          (
            values.email ??
            setting("MEFAGRAM_OWNER_EMAIL") ??
            "owner@mefagram.local"
          )
            .trim()
            .toLowerCase(),
        ),
  MEFAGRAM_DATA_DIR: testMode
    ? ".mefagram/e2e-db"
    : setting("MEFAGRAM_DATA_DIR") || ".mefagram/db",
  ...(!testMode && setting("DATABASE_URL")
    ? { DATABASE_URL: setting("DATABASE_URL")! }
    : {}),
};
const baseURL = new URL(config.BETTER_AUTH_URL);
if (
  baseURL.origin !== config.BETTER_AUTH_URL ||
  (baseURL.protocol !== "https:" &&
    !(
      baseURL.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(baseURL.hostname)
    ))
)
  throw new Error(
    "BETTER_AUTH_URL must be an HTTPS origin, or HTTP on localhost.",
  );
for (const key of ["BETTER_AUTH_SECRET", "MEFAGRAM_SETUP_KEY"] as const)
  if (config[key].length < 32 || config[key].startsWith("replace-with-"))
    throw new Error(
      `${key} must be a random secret of at least 32 characters. Leave it empty on first setup to generate one.`,
    );

await mkdir(".mefagram", { recursive: true, mode: 0o700 });
const db = await createDatabase({
  dataDir: resolve(config.MEFAGRAM_DATA_DIR),
  databaseUrl: testMode ? undefined : config.DATABASE_URL,
});
try {
  const auth = createAuth(db, {
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    setupKey: config.MEFAGRAM_SETUP_KEY,
    ownerEmail: config.MEFAGRAM_OWNER_EMAIL,
  });
  const owners = await db.query('SELECT id, name, email FROM "user" LIMIT 1');
  const accessFile = testMode
    ? ".mefagram/e2e-access.json"
    : ".mefagram/local-access.json";
  const accessContent = await optionalFile(accessFile);
  let access: Record<string, string> = accessContent
    ? JSON.parse(accessContent)
    : {};
  if (
    owners.rows.length &&
    owners.rows[0].email !== config.MEFAGRAM_OWNER_EMAIL
  )
    throw new Error(
      "This database already belongs to a different owner. Use its original owner configuration.",
    );
  if (owners.rows.length)
    config.MEFAGRAM_OWNER_NAME = String(owners.rows[0].name);
  // Persist usable configuration before creating an owner. A failed later step
  // must not strand an account behind newly generated, lost configuration.
  await writeFile(envFile, serializeEnvironment(config), { mode: 0o600 });
  await chmod(envFile, 0o600);
  let ownerId: string;
  if (!owners.rows.length) {
    const password = randomBytes(24).toString("base64url");
    access = {
      email: config.MEFAGRAM_OWNER_EMAIL,
      password,
      baseURL: config.BETTER_AUTH_URL,
    };
    await writeFile(accessFile, JSON.stringify(access, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(accessFile, 0o600);
    const user = await auth.api.signUpEmail({
      body: {
        name: ownerName,
        email: config.MEFAGRAM_OWNER_EMAIL,
        password,
      },
      headers: new Headers({
        "x-mefagram-setup-key": config.MEFAGRAM_SETUP_KEY,
      }),
    });
    ownerId = user.user.id;
  } else {
    ownerId = owners.rows[0].id as string;
  }
  if (!access.agentToken) {
    const token = await new PersonalTokenService(db).create(ownerId, {
      name: testMode ? "Test agent" : "Local setup agent",
      scopes: ["diagrams:read", "diagrams:write"],
      expiresInDays: 90,
    });
    access.agentToken = token.token;
  }
  access.baseURL = config.BETTER_AUTH_URL;
  if (values.example === "mefa-apps")
    await new DiagramService(db, "setup").create(
      ownerId,
      mefaAppsTemplate(),
      "initial-mefa-apps-template-v1",
    );
  // Validate the existing owner before rewriting any working configuration.
  await writeFile(accessFile, JSON.stringify(access, null, 2) + "\n", {
    mode: 0o600,
  });
  await chmod(accessFile, 0o600);
  console.log(
    `Mefagram ${testMode ? "test" : db.mode} workspace ready. Credentials: ${accessFile}.`,
  );
} finally {
  await db.close();
}
