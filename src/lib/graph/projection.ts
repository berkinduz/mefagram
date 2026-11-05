import type {
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
} from "@/lib/diagrams/schema";

export interface ProjectedNode extends DiagramNode {
  childCount: number;
  descendantCount: number;
  colourIndex: number;
}
export interface ProjectedEdge extends DiagramEdge {
  originalIds: string[];
}
export interface ProjectedGraph {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
  hiddenFeedbackCount?: number;
}

export function breadcrumbsFor(document: DiagramDocument, id: string) {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const path: DiagramNode[] = [];
  let node = byId.get(id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    path.unshift(node);
    seen.add(node.id);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return path;
}

export function projectGraph(
  document: DiagramDocument,
  options: { scopeId: string | null; showFeedback: boolean },
): ProjectedGraph {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const scope =
    options.scopeId && byId.has(options.scopeId) ? options.scopeId : null;
  const roots = document.nodes.filter((node) => !node.parentId);
  const rootColours = new Map(roots.map((node, index) => [node.id, index % 7]));
  const descendants = new Map<string, number>();
  const children = new Map<string, number>();
  for (const node of document.nodes) {
    if (node.parentId)
      children.set(node.parentId, (children.get(node.parentId) ?? 0) + 1);
    let parent = node.parentId;
    while (parent) {
      descendants.set(parent, (descendants.get(parent) ?? 0) + 1);
      parent = byId.get(parent)?.parentId;
    }
  }
  const nodes = document.nodes
    .filter((node) => (node.parentId ?? null) === scope)
    .map((node) => {
      const root = breadcrumbsFor(document, node.id)[0];
      return {
        ...node,
        childCount: children.get(node.id) ?? 0,
        descendantCount: descendants.get(node.id) ?? 0,
        colourIndex: rootColours.get(root?.id) ?? 0,
      };
    });
  const visible = new Set(nodes.map((node) => node.id));
  function representative(id: string) {
    let node = byId.get(id);
    while (node) {
      if (visible.has(node.id)) return node.id;
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    return null;
  }
  const edges = new Map<string, ProjectedEdge>();
  let hiddenFeedbackCount = 0;
  for (const edge of document.edges) {
    const source = representative(edge.source);
    const target = representative(edge.target);
    if (
      !source ||
      !target ||
      (source === target && (edge.source !== source || edge.target !== target))
    )
      continue;
    if (edge.kind === "feedback" && !options.showFeedback) {
      hiddenFeedbackCount++;
      continue;
    }
    const key = `${source}:${target}:${edge.kind}`;
    const existing = edges.get(key);
    if (existing) {
      existing.originalIds.push(edge.id);
      if (edge.label && !existing.label.includes(edge.label))
        existing.label = existing.label
          ? `${existing.originalIds.length} connections`
          : edge.label;
    } else
      edges.set(key, {
        ...edge,
        id: `projected-${edges.size}`,
        source,
        target,
        originalIds: [edge.id],
      });
  }
  return { nodes, edges: [...edges.values()], hiddenFeedbackCount };
}

export function searchNodes(document: DiagramDocument, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return document.nodes.filter((node) =>
    [
      node.label,
      node.description,
      node.notes,
      ...node.tags,
      ...node.sources.map((source) => source.label),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function neighbourIds(
  graph: { edges: Pick<DiagramEdge, "source" | "target">[] },
  id: string,
) {
  const ids = new Set([id]);
  for (const edge of graph.edges) {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  }
  return ids;
}
