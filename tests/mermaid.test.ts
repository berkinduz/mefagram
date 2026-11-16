import { describe, expect, test } from "vitest";
import { parseMermaid, toMermaid } from "@/lib/diagrams/mermaid";
import { createDiagramSchema } from "@/lib/diagrams/schema";
import { newsletterTemplate } from "@/lib/diagrams/seed";
import { createDatabase } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { DiagramService } from "@/lib/diagrams/service";

const byId = (document: ReturnType<typeof parseMermaid>) =>
  new Map(document.nodes.map((node) => [node.id, node]));

describe("Mermaid flowcharts", () => {
  test("reads shapes, subgraphs, chains, groups and link kinds", () => {
    const document = parseMermaid(`---
title: Login flow
---
flowchart LR
  %% a comment
  subgraph auth["Sign in"]
    form[Show form] --> check{"Valid?"}
    check -->|yes| done([Signed in])
    check -- no --> form
  end
  done -.-> metrics>Track success]
  a & b --> c; c --- docs
  classDef hot fill:#f00
  class a hot
`);
    const nodes = byId(document);
    expect(nodes.get("auth")).toMatchObject({ kind: "phase", label: "Sign in" });
    expect(nodes.get("form")).toMatchObject({ parentId: "auth", label: "Show form" });
    expect(nodes.get("check")).toMatchObject({ kind: "decision", label: "Valid?" });
    expect(nodes.get("done")).toMatchObject({ kind: "result", parentId: "auth" });
    expect(nodes.get("metrics")).toMatchObject({ kind: "note", parentId: null });
    const edges = document.edges.map((edge) => [
      edge.source,
      edge.target,
      edge.kind,
      edge.label,
    ]);
    expect(edges).toEqual(
      expect.arrayContaining([
        ["form", "check", "flow", ""],
        ["check", "done", "flow", "yes"],
        ["check", "form", "flow", "no"],
        ["done", "metrics", "feedback", ""],
        ["a", "c", "flow", ""],
        ["b", "c", "flow", ""],
        ["c", "docs", "reference", ""],
      ]),
    );
    expect(() =>
      createDiagramSchema.parse({ title: "Login", document }),
    ).not.toThrow();
  });

  test("handles compact links, odd IDs and reserved words", () => {
    const document = parseMermaid("graph TD\nA-->B-.->C\nmy.node[Node] --> end_");
    expect(document.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["A", "B"],
      ["B", "C"],
      ["my-node", "end_"],
    ]);
  });

  test("rejects other diagram types", () => {
    expect(() => parseMermaid("sequenceDiagram\nA->>B: hi")).toThrow(
      /flowcharts/,
    );
  });

  test("round-trips the bundled example's structure", () => {
    const template = newsletterTemplate();
    const back = parseMermaid(toMermaid(template));
    const original = byId(template.document);
    expect(back.nodes).toHaveLength(template.document.nodes.length);
    for (const node of back.nodes) {
      const source = original.get(node.id)!;
      expect(node.label).toBe(source.label);
      expect(node.parentId ?? null).toBe(source.parentId ?? null);
    }
    expect(
      back.edges.map((edge) => [edge.source, edge.target, edge.kind, edge.label]),
    ).toEqual(
      template.document.edges.map((edge) => [
        edge.source,
        edge.target,
        edge.kind ?? "flow",
        edge.label ?? "",
      ]),
    );
  });

  test("creates a saved diagram through the service, titled from front matter", async () => {
    const db = await createDatabase({ dataDir: "memory://" });
    try {
      const service = new DiagramService(db, "mcp");
      const saved = await service.createFromMermaid(
        LOCAL_OWNER,
        { mermaid: "---\ntitle: Release\n---\nflowchart LR\n  build --> ship" },
        "mermaid-create",
      );
      expect(saved).toMatchObject({ title: "Release", revision: 1 });
      expect(await service.mermaid(LOCAL_OWNER, saved.id)).toContain(
        "build --> ship",
      );
    } finally {
      await db.close();
    }
  });
});
