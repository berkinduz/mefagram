import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Copies the ELK layout worker into public/. An installed package already
// ships these files, and elkjs may be hoisted elsewhere, so failures are soft.
try {
  const require = createRequire(import.meta.url);
  const elk = dirname(require.resolve("elkjs/package.json"));
  await mkdir("public", { recursive: true });
  await copyFile(join(elk, "lib/elk-worker.min.js"), "public/elk-worker.min.js");
  await copyFile(join(elk, "LICENSE.md"), "public/elk-license.txt");
} catch (error) {
  if (!existsSync("public/elk-worker.min.js"))
    console.warn("Could not copy the ELK layout worker:", error.message);
}
