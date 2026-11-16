import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createDatabase } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { DiagramService } from "@/lib/diagrams/service";
import { createApiHandler } from "@/lib/http/api";
import { createMcpEndpoint } from "@/lib/mcp/server";

describe("live workspace", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let agent: Client;
  let diagramId: string;
  const base = "http://127.0.0.1:3500";
  const http = (path: string, init: RequestInit = {}) =>
    createApiHandler({ database: db })(
      new Request(`${base}${path}`, {
        ...init,
        headers: {
          host: "127.0.0.1:3500",
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      }),
    );

  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
    diagramId = (
      await new DiagramService(db).create(
        LOCAL_OWNER,
        {
          title: "Deploy",
          document: {
            schemaVersion: 1,
            nodes: [
              { id: "ship", label: "Ship", kind: "phase" },
              { id: "tag", label: "Tag release", parentId: "ship", notes: "semver" },
            ],
            edges: [],
          },
        },
        "live-diagram",
      )
    ).id;
    const endpoint = createMcpEndpoint({ database: db });
    agent = new Client({ name: "live-agent", version: "1.0.0" });
    await agent.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
        fetch: (input, init) => {
          const request = new Request(input, init);
          request.headers.set("host", "127.0.0.1:3500");
          return endpoint(request);
        },
      }),
    );
  });
  afterAll(async () => {
    await agent?.close();
    await db?.close();
  });

  test("streams saved revisions and comment changes to open workspaces", async () => {
    const abort = new AbortController();
    const response = await http("/api/events", { signal: abort.signal });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const next = async () => decoder.decode((await reader.read()).value);
    expect(await next()).toContain('"type":"ready"');
    const updated = await agent.callTool({
      name: "update_diagram",
      arguments: {
        id: diagramId,
        expectedRevision: 1,
        mutationId: "live-update",
        operations: [
          { op: "update_node", id: "tag", changes: { label: "Tag and sign" } },
        ],
      },
    });
    expect(updated.isError).toBeFalsy();
    expect(await next()).toContain(
      JSON.stringify({ type: "diagram", id: diagramId, revision: 2 }),
    );
    await http(`/api/diagrams/${diagramId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "Looks good" }),
    });
    expect(await next()).toContain(
      JSON.stringify({ type: "comments", diagramId }),
    );
    abort.abort();
  });

  test("tells the agent which diagram and node the developer has open", async () => {
    const before = await agent.callTool({ name: "get_current_view", arguments: {} });
    expect(before.structuredContent).toMatchObject({ open: false });
    expect(
      (
        await http("/api/view", {
          method: "POST",
          body: JSON.stringify({
            diagramId,
            scopeId: "ship",
            selectedId: "tag",
            mode: "map",
          }),
        })
      ).status,
    ).toBe(200);
    const view = await agent.callTool({ name: "get_current_view", arguments: {} });
    expect(view.structuredContent).toMatchObject({
      open: true,
      diagram: { id: diagramId, title: "Deploy" },
      phase: { id: "ship", label: "Ship" },
      selectedNode: { id: "tag", notes: "semver" },
    });
  });
});
