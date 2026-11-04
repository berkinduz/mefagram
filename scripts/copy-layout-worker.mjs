import { copyFile, mkdir } from "node:fs/promises";
await mkdir("public", { recursive: true });
await copyFile(
  "node_modules/elkjs/lib/elk-worker.min.js",
  "public/elk-worker.min.js",
);
await copyFile("node_modules/elkjs/LICENSE.md", "public/elk-license.txt");
