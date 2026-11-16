import { afterAll, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "@/lib/db";

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

test("refuses a second open of the same database and recovers a stale lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "mefagram-lock-"));
  dirs.push(root);
  const dataDir = join(root, "db");
  const first = await createDatabase({ dataDir });
  await expect(createDatabase({ dataDir })).rejects.toMatchObject({
    code: "DATABASE_IN_USE",
  });
  await first.close();
  // A lock left by a process that no longer exists is reclaimed.
  const child = spawn(process.execPath, ["-e", "0"]);
  const deadPid = await new Promise<number>((done) =>
    child.on("exit", () => done(child.pid!)),
  );
  await writeFile(`${dataDir}.lock`, String(deadPid));
  const reopened = await createDatabase({ dataDir });
  await reopened.close();
});
