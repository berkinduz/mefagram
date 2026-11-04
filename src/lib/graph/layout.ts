import type {
  ProjectedEdge,
  ProjectedGraph,
  ProjectedNode,
} from "./projection";
import type { ElkNode } from "elkjs/lib/elk-api";

export interface Point {
  x: number;
  y: number;
}
export interface LayoutNode extends ProjectedNode {
  position: Point;
  width: number;
  height: number;
}
export interface LayoutEdge extends ProjectedEdge {
  points: Point[];
  sourceHandle: string;
  targetHandle: string;
}
export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}
interface LayoutOptions {
  direction?: "RIGHT" | "DOWN";
  wrapColumns?: number;
  worker?: boolean;
}

const width = 250;
const heightOf = (node: ProjectedNode) => (node.childCount ? 178 : 152);

function linearOrder(graph: ProjectedGraph) {
  const flows = graph.edges.filter((edge) => edge.kind === "flow");
  if (flows.length !== graph.nodes.length - 1) return null;
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string>();
  for (const edge of flows) {
    if (outgoing.has(edge.source)) return null;
    outgoing.set(edge.source, edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  const starts = graph.nodes.filter((node) => !incoming.has(node.id));
  if (
    starts.length !== 1 ||
    [...incoming.values()].some((count) => count !== 1)
  )
    return null;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const ordered: ProjectedNode[] = [];
  let id: string | undefined = starts[0].id;
  const seen = new Set<string>();
  while (id && !seen.has(id) && byId.has(id)) {
    ordered.push(byId.get(id)!);
    seen.add(id);
    id = outgoing.get(id);
  }
  return ordered.length === graph.nodes.length ? ordered : null;
}

function flowRoute(
  edge: ProjectedEdge,
  nodes: Map<string, LayoutNode>,
): LayoutEdge {
  const source = nodes.get(edge.source)!;
  const target = nodes.get(edge.target)!;
  if (source.id === target.id)
    return {
      ...edge,
      sourceHandle: "right",
      targetHandle: "top",
      points: [
        {
          x: source.position.x + source.width,
          y: source.position.y + source.height / 2,
        },
        {
          x: source.position.x + source.width + 32,
          y: source.position.y + source.height / 2,
        },
        { x: source.position.x + source.width + 32, y: source.position.y - 24 },
        { x: source.position.x + source.width / 2, y: source.position.y - 24 },
        { x: source.position.x + source.width / 2, y: source.position.y },
      ],
    };
  if (source.position.y === target.position.y) {
    const right = source.position.x < target.position.x;
    return {
      ...edge,
      sourceHandle: right ? "right" : "left",
      targetHandle: right ? "left" : "right",
      points: [
        {
          x: source.position.x + (right ? source.width : 0),
          y: source.position.y + source.height / 2,
        },
        {
          x: target.position.x + (right ? 0 : target.width),
          y: target.position.y + target.height / 2,
        },
      ],
    };
  }
  const start = {
    x: source.position.x + source.width / 2,
    y: source.position.y + source.height,
  };
  const end = { x: target.position.x + target.width / 2, y: target.position.y };
  const middle = (start.y + end.y) / 2;
  return {
    ...edge,
    sourceHandle: "bottom",
    targetHandle: "top",
    points: [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end],
  };
}

function feedbackRoute(
  edge: ProjectedEdge,
  nodes: Map<string, LayoutNode>,
): LayoutEdge {
  const source = nodes.get(edge.source)!;
  const target = nodes.get(edge.target)!;
  const bottom =
    Math.max(
      ...[...nodes.values()].map((node) => node.position.y + node.height),
    ) + 44;
  const left =
    Math.min(...[...nodes.values()].map((node) => node.position.x)) - 36;
  const start = {
    x: source.position.x + source.width / 2,
    y: source.position.y + source.height,
  };
  const end = {
    x: target.position.x,
    y: target.position.y + target.height / 2,
  };
  return {
    ...edge,
    sourceHandle: "bottom",
    targetHandle: "left",
    points: [
      start,
      { x: start.x, y: bottom },
      { x: left, y: bottom },
      { x: left, y: end.y },
      end,
    ],
  };
}

export async function layoutGraph(
  graph: ProjectedGraph,
  options: LayoutOptions = {},
): Promise<GraphLayout> {
  if (!graph.nodes.length) return { nodes: [], edges: [] };
  const ordered = options.wrapColumns ? linearOrder(graph) : null;
  if (ordered && options.wrapColumns) {
    const columns = options.wrapColumns;
    const rowHeight = Math.max(...ordered.map(heightOf));
    const nodes = ordered.map((node, index) => {
      const row = Math.floor(index / columns);
      const column =
        row % 2 ? columns - 1 - (index % columns) : index % columns;
      return {
        ...node,
        width,
        height: heightOf(node),
        position: node.position ?? {
          x: 36 + column * (width + 68),
          y: 28 + row * (rowHeight + 72),
        },
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return {
      nodes,
      edges: graph.edges.map((edge) =>
        edge.kind === "feedback"
          ? feedbackRoute(edge, byId)
          : flowRoute(edge, byId),
      ),
    };
  }
  const direction = options.direction ?? "RIGHT";
  const ELK =
    options.worker && typeof window !== "undefined"
      ? (await import("elkjs/lib/elk-api.js")).default
      : (await import("elkjs/lib/elk.bundled.js")).default;
  const elk = new ELK(
    options.worker && typeof window !== "undefined"
      ? { workerUrl: "/elk-worker.min.js" }
      : undefined,
  );
  try {
    const result = await elk.layout<ElkNode>({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "52",
        "elk.layered.spacing.nodeNodeBetweenLayers": "86",
        "elk.padding": "[top=28,left=36,bottom=28,right=36]",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      },
      children: graph.nodes.map((node) => ({
        id: node.id,
        width,
        height: heightOf(node),
        layoutOptions: { "elk.portConstraints": "FIXED_POS" },
        ports: [
          {
            id: `${node.id}--out`,
            x: direction === "RIGHT" ? width : width / 2,
            y: direction === "RIGHT" ? heightOf(node) / 2 : heightOf(node),
            width: 0,
            height: 0,
            layoutOptions: {
              "elk.port.side": direction === "RIGHT" ? "EAST" : "SOUTH",
            },
          },
          {
            id: `${node.id}--in`,
            x: direction === "RIGHT" ? 0 : width / 2,
            y: direction === "RIGHT" ? heightOf(node) / 2 : 0,
            width: 0,
            height: 0,
            layoutOptions: {
              "elk.port.side": direction === "RIGHT" ? "WEST" : "NORTH",
            },
          },
        ],
      })),
      edges: graph.edges
        .filter((edge) => edge.kind !== "feedback")
        .map((edge) => ({
          id: edge.id,
          sources: [`${edge.source}--out`],
          targets: [`${edge.target}--in`],
        })),
    });
    const nodes = graph.nodes.map((node) => {
      const found = result.children!.find((child) => child.id === node.id)!;
      return {
        ...node,
        width,
        height: heightOf(node),
        position: node.position ?? { x: found.x ?? 0, y: found.y ?? 0 },
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges = graph.edges.map((edge) => {
      if (edge.kind === "feedback") return feedbackRoute(edge, byId);
      const section = result.edges?.find((item) => item.id === edge.id)
        ?.sections?.[0];
      if (
        !section ||
        byId.get(edge.source)?.position ===
          graph.nodes.find((node) => node.id === edge.source)?.position ||
        byId.get(edge.target)?.position ===
          graph.nodes.find((node) => node.id === edge.target)?.position
      )
        return flowRoute(edge, byId);
      return {
        ...edge,
        sourceHandle: direction === "RIGHT" ? "right" : "bottom",
        targetHandle: direction === "RIGHT" ? "left" : "top",
        points: [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ],
      };
    });
    return { nodes, edges };
  } finally {
    if (options.worker && typeof window !== "undefined") elk.terminateWorker();
  }
}
