import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const manifests = (await readdir(".next/server", { recursive: true })).filter(
  (path) => path.endsWith(".nft.json"),
);
assert(
  manifests.length > 0,
  "Build the application before checking its deployment bundle.",
);
const privateFiles = [];
for (const path of manifests) {
  const manifest = JSON.parse(await readFile(`.next/server/${path}`, "utf8"));
  for (const file of manifest.files)
    if (
      /(?:^|\/)(?:\.mefagram|\.superpowers|test-results|playwright-report)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/.test(
        file,
      )
    )
      privateFiles.push(`${path}: ${file}`);
}
assert.equal(
  privateFiles.length,
  0,
  `Private workspace files must never enter a deployment bundle. Found ${privateFiles.length} traced files.`,
);
console.log(
  `Deployment bundle verified: ${manifests.length} manifests, no private workspace files.`,
);
