import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { parse } from "dotenv";

// These reserved paths contain disposable fixtures, never the local workspace.
for (const path of [
  ".mefagram/e2e-db",
  ".mefagram/e2e.env",
  ".mefagram/e2e-access.json",
])
  await rm(path, { recursive: true, force: true });
const setup = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/setup.ts", "--e2e", "--example", "mefa-apps"],
  { stdio: "inherit" },
);
await new Promise<void>((resolve, reject) =>
  setup.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("Test workspace setup failed.")),
  ),
);
const env = parse(await readFile(".mefagram/e2e.env"));
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    process.env.MEFAGRAM_TEST_PRODUCTION === "1" ? "start" : "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { env: { ...process.env, ...env, DATABASE_URL: "" }, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => app.kill(signal));
app.on("exit", (code) => process.exit(code ?? 0));
