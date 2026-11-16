import { closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { DiagramError } from "@/lib/diagrams/errors";

// PGlite keeps the database in memory and writes it back to disk; two
// processes opening the same directory overwrite each other's changes. A lock
// file next to the directory makes the second process fail loudly instead.

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function acquireDataLock(dataDir: string) {
  const path = `${dataDir}.lock`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = openSync(path, "wx", 0o600);
      writeSync(handle, String(process.pid));
      closeSync(handle);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        process.off("exit", release);
        try {
          if (readFileSync(path, "utf8").trim() === String(process.pid))
            rmSync(path, { force: true });
        } catch {
          /* Already gone. */
        }
      };
      process.once("exit", release);
      return release;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let owner = Number.NaN;
      try {
        owner = Number(readFileSync(path, "utf8").trim());
      } catch {
        /* Unreadable lock: treat as stale. */
      }
      if (owner === process.pid || (Number.isInteger(owner) && alive(owner)))
        throw new DiagramError(
          "DATABASE_IN_USE",
          `The Mefagram database ${dataDir} is already open in another process (pid ${owner}). Stop that Mefagram server first, or connect to it instead.`,
          409,
        );
      rmSync(path, { force: true });
    }
  }
  throw new DiagramError(
    "DATABASE_IN_USE",
    `Could not lock the Mefagram database ${dataDir}.`,
    409,
  );
}
