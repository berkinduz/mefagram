import { readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Turbopack links external server packages as .next/node_modules/<name>-<hash>.
// npm never packs node_modules, so record the links; the CLI recreates them
// against wherever the installed dependencies actually live.
const base = ".next/node_modules";
const links = {};
if (existsSync(base)) {
  for (const entry of await readdir(base)) {
    const names = entry.startsWith("@")
      ? (await readdir(join(base, entry))).map((name) => `${entry}/${name}`)
      : [entry];
    for (const name of names) {
      const match = /^(.*)-[0-9a-f]{16}$/.exec(name);
      if (match) links[name] = match[1];
    }
  }
}
await writeFile(".next/external-modules.json", `${JSON.stringify(links, null, 2)}\n`);
console.log(`Recorded ${Object.keys(links).length} external module link(s).`);
