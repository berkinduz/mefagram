import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { connectAgent } from "./agent-access";
import type { DiagramRecord } from "../src/lib/diagrams/schema";

const phase = process.argv[2];
assert(
  ["before-restart", "after-restart"].includes(phase),
  "Use before-restart or after-restart.",
);
const { client, baseURL } = await connectAgent();
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  assert(
    !result.isError,
    `MCP ${name} failed: ${JSON.stringify(result.structuredContent)}`,
  );
  return result.structuredContent as unknown as DiagramRecord;
}
await mkdir(".mefagram/evidence", { recursive: true, mode: 0o700 });
try {
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 7);
  if (phase === "before-restart") {
    const created = await call("create_diagram", {
      title: "MCP restart verification",
      tags: ["Verification"],
      document: {
        schemaVersion: 1,
        nodes: [
          {
            id: "persisted-agent-node",
            label: "Persistent agent record",
            description: "Written to the production server through real HTTP MCP.",
          },
        ],
        edges: [],
      },
      mutationId: crypto.randomUUID(),
    });
    const saved = await call("update_diagram", {
      id: created.id,
      expectedRevision: created.revision,
      operations: [
        {
          op: "update_node",
          id: "persisted-agent-node",
          changes: {
            notes: "Must remain here after the server restarts.",
            sources: [{ label: "React Flow", url: "https://reactflow.dev/" }],
          },
        },
      ],
      mutationId: crypto.randomUUID(),
    });
    assert.equal(saved.revision, 2);
    await writeFile(
      ".mefagram/evidence/restart-marker.json",
      JSON.stringify(
        {
          id: saved.id,
          revision: saved.revision,
          note: saved.document.nodes[0].notes,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      `Production MCP create/update confirmed: ${saved.id}, revision ${saved.revision}. Restart the server, then run after-restart.`,
    );
  } else {
    const marker = JSON.parse(
      await readFile(".mefagram/evidence/restart-marker.json", "utf8"),
    );
    const reopened = await call("get_diagram", { id: marker.id });
    assert.equal(reopened.revision, marker.revision);
    assert.equal(reopened.document.nodes[0].notes, marker.note);
    const access = JSON.parse(
      await readFile(
        process.env.MEFAGRAM_ACCESS_FILE ?? ".mefagram/local-access.json",
        "utf8",
      ),
    );
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1512, height: 982 },
      });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseURL}/sign-in`);
      await page.getByLabel("Email").fill(access.email);
      await page.getByLabel("Password", { exact: true }).fill(access.password);
      await page.getByRole("button", { name: "Open workspace" }).click();
      await page
        .getByRole("navigation", { name: "Diagram collection" })
        .waitFor();
      await page.goto(`${baseURL}/?diagram=${marker.id}`);
      await page
        .getByText("Persistent agent record", { exact: true })
        .first()
        .click();
      await page
        .getByRole("complementary", { name: "Node details" })
        .getByText(marker.note, { exact: true })
        .waitFor();
      await page.screenshot({
        path: ".mefagram/evidence/production-mcp-readback.png",
      });
      assert.deepEqual(
        errors,
        [],
        "The production browser must have no uncaught application errors.",
      );
      console.log(
        `Restart persistence and fresh production-browser read-back confirmed: revision ${reopened.revision}.`,
      );
    } finally {
      await browser.close();
    }
    const archived = await call("update_diagram", {
      id: reopened.id,
      expectedRevision: reopened.revision,
      operations: [{ op: "update_metadata", changes: { archived: true } }],
      mutationId: crypto.randomUUID(),
    });
    assert(archived.archived);
    await writeFile(
      ".mefagram/evidence/production-result.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          storage: "local PGlite",
          id: reopened.id,
          readRevision: reopened.revision,
          archivedRevision: archived.revision,
          mcpToolCount: tools.tools.length,
          restartPersistence: true,
          freshBrowserReadback: true,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
} finally {
  await client.close();
}
