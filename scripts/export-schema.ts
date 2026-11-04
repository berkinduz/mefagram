import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { exportSchema } from "../src/lib/diagrams/schema";

await writeFile(
  "docs/diagram-export.schema.json",
  JSON.stringify(z.toJSONSchema(exportSchema), null, 2) + "\n",
);
