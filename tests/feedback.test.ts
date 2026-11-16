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

describe("developer feedback loop", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let agent: Client;
  let diagramId: string;
  const base = "http://127.0.0.1:3400";
  const http = (path: string, method = "GET", body?: unknown) =>
    createApiHandler({ database: db })(
      new Request(`${base}${path}`, {
        method,
        headers: {
          host: "127.0.0.1:3400",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await agent.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.structuredContent)).toBeFalsy();
    return result.structuredContent as Record<string, unknown>;
  };

  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
    diagramId = (
      await new DiagramService(db).create(
        LOCAL_OWNER,
        {
          title: "Checkout",
          document: {
            schemaVersion: 1,
            nodes: [{ id: "pay", label: "Take payment" }],
            edges: [],
          },
        },
        "feedback-diagram",
      )
    ).id;
    const endpoint = createMcpEndpoint({ database: db });
    agent = new Client({ name: "feedback-agent", version: "1.0.0" });
    await agent.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
        fetch: (input, init) => {
          const request = new Request(input, init);
          request.headers.set("host", "127.0.0.1:3400");
          return endpoint(request);
        },
      }),
    );
  });
  afterAll(async () => {
    await agent?.close();
    await db?.close();
  });

  test("a developer comment reaches the agent and the agent's reply comes back", async () => {
    const posted = await http(`/api/diagrams/${diagramId}/comments`, "POST", {
      nodeId: "pay",
      body: "Split this into authorise and capture.",
    });
    expect(posted.status).toBe(201);
    const { comments } = (await call("get_feedback")) as {
      comments: { id: string; nodeLabel: string; viewUrl: string }[];
    };
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      nodeLabel: "Take payment",
      viewUrl: `${base}/?diagram=${diagramId}&node=pay`,
    });
    await call("resolve_feedback", {
      id: comments[0].id,
      reply: "Split into two steps.",
    });
    expect((await call("get_feedback")).comments).toEqual([]);
    const thread = await (
      await http(`/api/diagrams/${diagramId}/comments`)
    ).json();
    expect(thread[0]).toMatchObject({
      status: "resolved",
      reply: "Split into two steps.",
    });
  });

  test("an agent question waits for the developer, then returns with the answer", async () => {
    const question = (await call("ask_developer", {
      diagramId,
      nodeId: "pay",
      body: "Which payment provider?",
    })) as { id: string };
    // Unanswered questions do not clutter the agent's inbox.
    expect((await call("get_feedback")).comments).toEqual([]);
    expect(
      (
        await http(`/api/comments/${question.id}/answer`, "POST", {
          reply: "Stripe.",
        })
      ).status,
    ).toBe(200);
    const { comments } = (await call("get_feedback")) as {
      comments: { id: string; author: string; reply: string }[];
    };
    expect(comments).toEqual([
      expect.objectContaining({ id: question.id, author: "agent", reply: "Stripe." }),
    ]);
  });

  test("rejects comments on unknown nodes and from other websites", async () => {
    expect(
      (
        await http(`/api/diagrams/${diagramId}/comments`, "POST", {
          nodeId: "missing",
          body: "?",
        })
      ).status,
    ).toBe(400);
    const crossSite = await createApiHandler({ database: db })(
      new Request(`${base}/api/diagrams/${diagramId}/comments`, {
        method: "POST",
        headers: {
          host: "127.0.0.1:3400",
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ body: "Delete everything" }),
      }),
    );
    expect(crossSite.status).toBe(403);
  });
});
