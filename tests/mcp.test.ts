import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createDatabase } from "@/lib/db";
import { createAuth } from "@/lib/auth/server";
import { PersonalTokenService } from "@/lib/auth/tokens";
import { createMcpEndpoint } from "@/lib/mcp/server";
import { DiagramService } from "@/lib/diagrams/service";

describe("real MCP client to persistent diagram tools", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let ownerId: string;
  const baseURL = "http://localhost:3300";
  const clients: Client[] = [];
  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
    const setupKey = randomBytes(32).toString("hex");
    auth = createAuth(db, {
      baseURL,
      setupKey,
      ownerEmail: "mcp@mefagram.local",
      secret: randomBytes(40).toString("hex"),
    });
    ownerId = (
      await auth.api.signUpEmail({
        body: {
          email: "mcp@mefagram.local",
          password: randomBytes(24).toString("base64url"),
          name: "MCP Owner",
        },
        headers: new Headers({ "x-mefagram-setup-key": setupKey }),
      })
    ).user.id;
  });
  afterAll(async () => {
    for (const client of clients) await client.close();
    await db?.close();
  });

  async function connect(scopes: ("diagrams:read" | "diagrams:write")[]) {
    const issued = await new PersonalTokenService(db).create(ownerId, {
      name: "MCP test",
      scopes,
      expiresInDays: 1,
    });
    const endpoint = createMcpEndpoint({ database: db, auth, baseURL });
    const client = new Client({
      name: "mefagram-test-agent",
      version: "1.0.0",
    });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${issued.token}` } },
        fetch: (input, init) => endpoint(new Request(input, init)),
      }),
    );
    return client;
  }

  test("discovers tools and creates, updates and rereads the same database record", async () => {
    const client = await connect(["diagrams:read", "diagrams:write"]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("update_diagram");
    const created = await client.callTool({
      name: "create_diagram",
      arguments: {
        title: "MCP ile oluşturuldu",
        description: "",
        tags: [],
        document: {
          schemaVersion: 1,
          nodes: [{ id: "agent-node", label: "Agent düğümü", kind: "step" }],
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
            changes: { notes: "MCP kaydı doğrulandı" },
          },
        ],
        mutationId: "mcp-update",
      },
    });
    expect(updated.isError).not.toBe(true);
    const reopened = await new DiagramService(db).get(ownerId, record.id);
    expect(reopened.document.nodes[0].notes).toBe("MCP kaydı doğrulandı");
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

  test("does not allow writes with a read-only token", async () => {
    const client = await connect(["diagrams:read"]);
    const result = await client.callTool({
      name: "create_diagram",
      arguments: {
        title: "Forbidden",
        description: "",
        tags: [],
        document: { schemaVersion: 1, nodes: [], edges: [] },
        mutationId: "mcp-read-only",
      },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "INSUFFICIENT_SCOPE",
    });
  });
});
