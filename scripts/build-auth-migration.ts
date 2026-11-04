import { readFile, writeFile, readdir } from "node:fs/promises";

const entries = (await readdir("migrations/auth"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const statements = await Promise.all(
  entries.map((name) => readFile(`migrations/auth/${name}`, "utf8")),
);
await writeFile(
  "src/lib/db/auth-migration.ts",
  `// Generated from migrations/auth; initial auth-v1 snapshot; do not rewrite applied migration history.\nexport const authMigration = ${JSON.stringify(statements.join("\n"))};\n`,
);
