import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createDatabase } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { createMcpEndpoint } from "@/lib/mcp/server";
import { DiagramService } from "@/lib/diagrams/service";

describe("real MCP client to persistent diagram tools", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  const ownerId = LOCAL_OWNER;
  const baseURL = "http://127.0.0.1:3300";
  const clients: Client[] = [];
  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
  });
  afterAll(async () => {
    for (const client of clients) await client.close();
    await db?.close();
  });

  async function connect(headers: Record<string, string> = {}) {
    const endpoint = createMcpEndpoint({ database: db });
    const client = new Client({
      name: "mefagram-test-agent",
      version: "1.0.0",
    });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
        fetch: (input, init) => {
          const request = new Request(input, init);
          request.headers.set("host", "127.0.0.1:3300");
          for (const [key, value] of Object.entries(headers))
            request.headers.set(key, value);
          return endpoint(request);
        },
      }),
    );
    return client;
  }

  test("discovers tools and creates, updates and rereads the same database record", async () => {
    const client = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("update_diagram");
    const created = await client.callTool({
      name: "create_diagram",
      arguments: {
        title: "Created through MCP",
        description: "",
        tags: [],
        document: {
          schemaVersion: 1,
          nodes: [{ id: "agent-node", label: "Agent node", kind: "step" }],
          edges: [],
        },
        mutationId: "mcp-create",
      },
    });
    expect(created.isError).not.toBe(true);
    const record = created.structuredContent as {
      id: string;
      revision: number;
    };
    expect(record.revision).toBe(1);
    const updated = await client.callTool({
      name: "update_diagram",
      arguments: {
        id: record.id,
        expectedRevision: 1,
        operations: [
          {
            op: "update_node",
            id: "agent-node",
            changes: { notes: "MCP save verified" },
          },
        ],
        mutationId: "mcp-update",
      },
    });
    expect(updated.isError).not.toBe(true);
    const reopened = await new DiagramService(db).get(ownerId, record.id);
    expect(reopened.document.nodes[0].notes).toBe("MCP save verified");
    expect(reopened.revision).toBe(2);
    const stale = await client.callTool({
      name: "update_diagram",
      arguments: {
        id: record.id,
        expectedRevision: 1,
        operations: [{ op: "update_metadata", changes: { title: "Old" } }],
        mutationId: "mcp-stale",
      },
    });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({
      code: "REVISION_CONFLICT",
    });
  });

  test("refuses MCP requests from other websites and rebinding hosts", async () => {
    const endpoint = createMcpEndpoint({ database: db });
    const call = (headers: Record<string, string>) =>
      endpoint(
        new Request(`${baseURL}/api/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...headers,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "list_diagrams", arguments: {} },
          }),
        }),
      );
    expect((await call({ host: "evil.example" })).status).toBe(403);
    expect(
      (await call({ host: "127.0.0.1:3300", origin: "https://evil.example" }))
        .status,
    ).toBe(403);
    await expect(
      connect({ origin: "https://evil.example" }),
    ).rejects.toThrow();
  });

  test("shares one canonical diagram across independent agents and rejects a concurrent stale write", async () => {
    const first = await connect();
    const second = await connect();
    const created = await first.callTool({
      name: "create_diagram",
      arguments: {
        title: "Shared workspace",
        document: {
          schemaVersion: 1,
          nodes: [{ id: "shared", label: "Shared node" }],
          edges: [],
        },
        mutationId: "shared-create",
      },
    });
    const { id, revision } = created.structuredContent as {
      id: string;
      revision: number;
    };
    expect(
      (await second.callTool({ name: "get_diagram", arguments: { id } }))
        .structuredContent,
    ).toMatchObject({ id, revision });
    const results = await Promise.all(
      [first, second].map((client, index) =>
        client.callTool({
          name: "update_diagram",
          arguments: {
            id,
            expectedRevision: revision,
            operations: [
              {
                op: "update_node",
                id: "shared",
                changes: { notes: `Agent ${index}` },
              },
            ],
            mutationId: `shared-update-${index}`,
          },
        }),
      ),
    );
    expect(results.filter((result) => !result.isError)).toHaveLength(1);
    expect(
      results.find((result) => result.isError)?.structuredContent,
    ).toMatchObject({ code: "REVISION_CONFLICT" });
    const reads = await Promise.all(
      [first, second].map((client) =>
        client.callTool({ name: "get_diagram", arguments: { id } }),
      ),
    );
    expect(reads[0].structuredContent).toEqual(reads[1].structuredContent);
    expect(reads[0].structuredContent).toMatchObject({ id, revision: 2 });
  });
});
