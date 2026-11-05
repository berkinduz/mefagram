import { expect, test } from "vitest";
import { validated, documentSchema } from "@/lib/diagrams/schema";
import {
  projectGraph,
  searchNodes,
  neighbourIds,
  breadcrumbsFor,
} from "@/lib/graph/projection";
import { layoutGraph } from "@/lib/graph/layout";

const document = validated(documentSchema, {
  schemaVersion: 1,
  nodes: [
    { id: "research", label: "Research", kind: "phase" },
    { id: "release", label: "Release", kind: "phase" },
    {
      id: "interview",
      label: "Interviews",
      parentId: "research",
      description: "Understand user needs",
      notes: "Identify unclear decisions",
      tags: ["Insights"],
      sources: [{ label: "Interview guide", url: "https://example.org/guide" }],
    },
    { id: "evidence", label: "Collect evidence", parentId: "research" },
    { id: "launch", label: "Open the store", parentId: "release" },
  ],
  edges: [
    { id: "within", source: "interview", target: "evidence" },
    { id: "between", source: "evidence", target: "launch" },
    { id: "root-flow", source: "research", target: "release" },
    { id: "learning", source: "release", target: "research", kind: "feedback" },
  ],
});

test("projects child connections onto their visible phases without self loops", () => {
  const projected = projectGraph(document, {
    scopeId: null,
    showFeedback: true,
  });
  expect(projected.nodes.map((node) => node.id)).toEqual([
    "research",
    "release",
  ]);
  expect(projected.edges.filter((edge) => edge.kind === "flow")).toHaveLength(
    1,
  );
  expect(projected.edges.find((edge) => edge.kind === "flow")).toMatchObject({
    source: "research",
    target: "release",
    originalIds: ["between", "root-flow"],
  });
  expect(projected.edges.some((edge) => edge.source === edge.target)).toBe(
    false,
  );
});

test("drills into a phase and preserves its internal order and breadcrumb", () => {
  const projected = projectGraph(document, {
    scopeId: "research",
    showFeedback: false,
  });
  expect(projected.nodes.map((node) => node.id)).toEqual([
    "interview",
    "evidence",
  ]);
  expect(projected.edges.map((edge) => edge.originalIds)).toEqual([["within"]]);
  expect(
    breadcrumbsFor(document, "interview").map((node) => node.label),
  ).toEqual(["Research", "Interviews"]);
});

test("retains a real self loop while hiding connections internal to a collapsed phase", async () => {
  const withLoop = validated(documentSchema, {
    ...document,
    edges: [
      ...document.edges,
      {
        id: "retry",
        source: "research",
        target: "research",
        label: "Reconsider",
      },
    ],
  });
  const graph = projectGraph(withLoop, { scopeId: null, showFeedback: true });
  expect(
    graph.edges.find((edge) => edge.originalIds.includes("retry")),
  ).toMatchObject({ source: "research", target: "research" });
  expect(graph.edges.some((edge) => edge.originalIds.includes("within"))).toBe(
    false,
  );
  const layout = await layoutGraph(graph, { worker: false });
  expect(
    layout.edges.find((edge) => edge.originalIds.includes("retry"))!.points
      .length,
  ).toBeGreaterThan(2);
});

test("finds English labels, descriptions, notes, tags and sources regardless of case", () => {
  for (const query of [
    "INTERVIEWS",
    "USER NEEDS",
    "IDENTIFY",
    "INSIGHTS",
    "INTERVIEW GUIDE",
  ]) {
    expect(searchNodes(document, query).map((node) => node.id)).toEqual([
      "interview",
    ]);
  }
});

test("returns a focused neighbourhood and can hide feedback connections", () => {
  expect([...neighbourIds(document, "evidence")].sort()).toEqual([
    "evidence",
    "interview",
    "launch",
  ]);
  expect(
    projectGraph(document, { scopeId: null, showFeedback: false }).edges.some(
      (edge) => edge.kind === "feedback",
    ),
  ).toBe(false);
});

test("lays out a graph with non-overlapping nodes and routes at actual endpoints", async () => {
  const graph = projectGraph(document, { scopeId: null, showFeedback: true });
  const layout = await layoutGraph(graph, {
    direction: "RIGHT",
    worker: false,
  });
  const first = layout.nodes.find((node) => node.id === "research")!;
  const second = layout.nodes.find((node) => node.id === "release")!;
  expect(first.position.x + first.width).toBeLessThan(second.position.x);
  const edge = layout.edges.find((edge) => edge.kind === "flow")!;
  expect(edge.points[0].x).toBe(first.position.x + first.width);
  expect(edge.points.at(-1)!.x).toBe(second.position.x);
});

test("handles an empty diagram and a disconnected graph without losing nodes", async () => {
  expect(
    (await layoutGraph({ nodes: [], edges: [] }, { worker: false })).nodes,
  ).toEqual([]);
  const disconnected = projectGraph(
    validated(documentSchema, {
      schemaVersion: 1,
      nodes: [
        { id: "one", label: "One" },
        { id: "two", label: "Two" },
      ],
      edges: [],
    }),
    { scopeId: null, showFeedback: false },
  );
  const layout = await layoutGraph(disconnected, { worker: false });
  expect(layout.nodes.map((node) => node.id).sort()).toEqual(["one", "two"]);
  expect(layout.nodes[0].position).not.toEqual(layout.nodes[1].position);
});

test("wraps a linear process into readable rows while retaining every connection", async () => {
  const linear = validated(documentSchema, {
    schemaVersion: 1,
    nodes: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({
      id,
      label: id,
      kind: "phase",
    })),
    edges: ["a", "b", "c", "d", "e", "f"].map((id, index) => ({
      id: `edge-${id}`,
      source: id,
      target: ["b", "c", "d", "e", "f", "g"][index],
    })),
  });
  const layout = await layoutGraph(
    projectGraph(linear, { scopeId: null, showFeedback: true }),
    { wrapColumns: 3, worker: false },
  );
  expect(
    layout.nodes.find((node) => node.id === "d")!.position.y,
  ).toBeGreaterThan(layout.nodes.find((node) => node.id === "a")!.position.y);
  expect(layout.nodes.find((node) => node.id === "d")!.position.x).toBe(
    layout.nodes.find((node) => node.id === "c")!.position.x,
  );
  expect(layout.edges).toHaveLength(6);
  expect(
    Math.max(...layout.nodes.map((node) => node.position.x + node.width)),
  ).toBeLessThan(1000);
});

test("routes a branching map to the exact center of its visible connection handles", async () => {
  const branching = validated(documentSchema, {
    schemaVersion: 1,
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id })),
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "ac", source: "a", target: "c" },
      { id: "bd", source: "b", target: "d" },
      { id: "cd", source: "c", target: "d" },
    ],
  });
  const layout = await layoutGraph(
    projectGraph(branching, { scopeId: null, showFeedback: true }),
    { worker: false },
  );
  for (const edge of layout.edges) {
    const from = layout.nodes.find((node) => node.id === edge.source)!;
    const to = layout.nodes.find((node) => node.id === edge.target)!;
    expect(edge.points[0]).toEqual({
      x: from.position.x + from.width,
      y: from.position.y + from.height / 2,
    });
    expect(edge.points.at(-1)).toEqual({
      x: to.position.x,
      y: to.position.y + to.height / 2,
    });
  }
});
