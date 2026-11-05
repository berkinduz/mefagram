"use client";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  ConnectionMode,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useNodesState,
  useReactFlow,
  useViewport,
  useStore,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type Connection,
} from "@xyflow/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Diamond,
  Focus,
  Layers3,
  Maximize,
  Minus,
  Plus,
  StickyNote,
  Workflow,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { DiagramDocument } from "@/lib/diagrams/schema";
import {
  projectGraph,
  neighbourIds,
  type ProjectedNode,
} from "@/lib/graph/projection";
import {
  layoutGraph,
  type GraphLayout,
  type LayoutEdge,
} from "@/lib/graph/layout";

type MapNode = Node<
  { item: ProjectedNode; editing: boolean; onDrill: (id: string) => void },
  "mapNode"
>;
type MapEdge = Edge<{ route: LayoutEdge }, "routed">;
const kindLabels = {
  phase: "Phase",
  step: "Step",
  decision: "Decision",
  note: "Note",
  result: "Result",
};
const positions = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const DiagramCard = memo(function DiagramCard({
  data,
  selected,
}: NodeProps<MapNode>) {
  const { item, editing, onDrill } = data;
  const Icon =
    item.kind === "decision"
      ? Diamond
      : item.kind === "note"
        ? StickyNote
        : item.kind === "result"
          ? ArrowUpRight
          : item.kind === "phase"
            ? Layers3
            : Workflow;
  return (
    <article
      className={`map-card tone-${item.colourIndex} ${selected ? "map-card-selected" : ""} ${editing ? "map-card-editing" : ""}`}
    >
      {Object.entries(positions).map(([id, position]) => (
        <Handle
          type="source"
          key={id}
          position={position}
          id={id}
          isConnectable={editing}
          aria-label={`${item.label} connection handle`}
        />
      ))}
      <div className="map-card-top">
        <span className="node-kind">
          <Icon size={13} />
          {kindLabels[item.kind]}
        </span>
        {item.sources.length > 0 && (
          <span
            className="node-resource-count"
            title={`${item.sources.length} ${item.sources.length === 1 ? "source" : "sources"}`}
          >
            {item.sources.length}{" "}
            {item.sources.length === 1 ? "source" : "sources"}
          </span>
        )}
      </div>
      <h3>{item.label}</h3>
      <p>{item.description || "No description yet."}</p>
      {item.childCount > 0 ? (
        <button
          className="node-drill nodrag nopan"
          aria-label={`Open ${item.label} phase`}
          onClick={(event) => {
            event.stopPropagation();
            onDrill(item.id);
          }}
        >
          <span>
            {item.childCount}{" "}
            {item.childCount === 1 ? "child step" : "child steps"}
          </span>
          <ChevronRight size={15} />
        </button>
      ) : item.notes ? (
        <div className="node-note">
          <StickyNote size={12} />
          Has notes
        </div>
      ) : null}
    </article>
  );
});

function RoutedEdge(props: EdgeProps<MapEdge>) {
  const route = props.data!.route;
  const first = route.points[0];
  const last = route.points.at(-1);
  const moved =
    !first ||
    !last ||
    Math.abs(first.x - props.sourceX) > 2 ||
    Math.abs(first.y - props.sourceY) > 2 ||
    Math.abs(last.x - props.targetX) > 2 ||
    Math.abs(last.y - props.targetY) > 2;
  const [fallback, fallbackX, fallbackY] = getSmoothStepPath(props);
  const path = moved
    ? fallback
    : route.points
        .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
        .join(" ");
  const mid = route.points[Math.floor((route.points.length - 1) / 2)];
  const next =
    route.points[
      Math.min(
        Math.floor((route.points.length - 1) / 2) + 1,
        route.points.length - 1,
      )
    ];
  const labelX = moved ? fallbackX : (mid.x + next.x) / 2;
  const labelY = moved ? fallbackY : (mid.y + next.y) / 2;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={22}
        style={props.style}
      />
      {route.label && (
        <EdgeLabelRenderer>
          <span
            className={`edge-label nodrag nopan edge-label-${route.kind}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {route.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { mapNode: DiagramCard };
const edgeTypes = { routed: RoutedEdge };

interface CanvasProps {
  document: DiagramDocument;
  scopeId: string | null;
  selectedId: string | null;
  editing: boolean;
  focus: boolean;
  showFeedback: boolean;
  onSelect: (id: string | null) => void;
  onDrill: (id: string) => void;
  onEdge: (ids: string[]) => void;
  onConnect: (connection: Connection) => void;
  onMove: (id: string, position: { x: number; y: number }) => Promise<void>;
}

function CanvasControls({
  showMinimap,
  setShowMinimap,
}: {
  showMinimap: boolean;
  setShowMinimap: (value: boolean) => void;
}) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="canvas-controls" aria-label="Map view">
      <button
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => flow.zoomOut({ duration: 160 })}
      >
        <Minus size={16} />
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => flow.zoomIn({ duration: 160 })}
      >
        <Plus size={16} />
      </button>
      <i />
      <button
        aria-label="Fit map to screen"
        title="Fit to screen (F)"
        onClick={() =>
          flow.fitView({ padding: 0.13, maxZoom: 1, duration: 240 })
        }
      >
        <Maximize size={16} />
      </button>
      <button
        aria-label="Show minimap"
        title="Minimap"
        aria-pressed={showMinimap}
        onClick={() => setShowMinimap(!showMinimap)}
      >
        <Layers3 size={16} />
      </button>
    </div>
  );
}

function CanvasScene(props: CanvasProps) {
  const {
    document,
    scopeId,
    editing,
    selectedId,
    focus,
    showFeedback,
    onSelect,
    onDrill,
    onEdge,
    onConnect,
    onMove,
  } = props;
  const graph = useMemo(
    () => projectGraph(document, { scopeId, showFeedback }),
    [document, scopeId, showFeedback],
  );
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>([]);
  const flow = useReactFlow<MapNode, MapEdge>();
  const canvasWidth = useStore((state) => state.width);
  const geometryKey = JSON.stringify({
    scopeId,
    nodes: graph.nodes.map((node) => [node.id, node.childCount, node.position]),
    edges: graph.edges.map((edge) => [
      edge.id,
      edge.source,
      edge.target,
      edge.kind,
    ]),
  });

  useEffect(() => {
    let cancelled = false;
    layoutGraph(graph, { wrapColumns: 3, worker: true })
      .then((result) => {
        if (!cancelled) {
          setLayoutError(false);
          setLayout(result);
        }
      })
      .catch(() => {
        if (!cancelled) setLayoutError(true);
      });
    return () => {
      cancelled = true;
    };
    // Geometry changes trigger layout; edits to notes or sources do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryKey]);

  useEffect(() => {
    if (!layout) return;
    const current = new Map(graph.nodes.map((node) => [node.id, node]));
    setNodes(
      layout.nodes
        .filter((node) => current.has(node.id))
        .map((node) => ({
          id: node.id,
          type: "mapNode",
          position: node.position,
          style: { width: node.width, height: node.height },
          width: node.width,
          height: node.height,
          data: { item: current.get(node.id)!, editing, onDrill },
          ariaLabel: current.get(node.id)!.label,
        })),
    );
  }, [layout, graph.nodes, editing, onDrill, setNodes]);

  useEffect(() => {
    const related =
      selectedId && focus ? neighbourIds(graph, selectedId) : null;
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        className: related && !related.has(node.id) ? "node-dimmed" : "",
      })),
    );
  }, [selectedId, focus, graph, layout, setNodes]);

  useEffect(() => {
    if (!layout) return;
    const frame = requestAnimationFrame(() => {
      if (layout.nodes.length > 12)
        flow.setViewport({ x: 24, y: 54, zoom: 0.8 }, { duration: 0 });
      else flow.fitView({ padding: 0.13, maxZoom: 1, duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
    // Fit only a new layout, preserving pan/zoom when reading notes or selecting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    if (!selectedId || !layout) return;
    const node = layout.nodes.find((item) => item.id === selectedId);
    if (!node) return;
    const frame = requestAnimationFrame(() =>
      flow.setCenter(
        node.position.x + node.width / 2,
        node.position.y + node.height / 2,
        { zoom: Math.max(0.65, Math.min(1, flow.getZoom())), duration: 180 },
      ),
    );
    return () => cancelAnimationFrame(frame);
    // A search result or a newly opened inspector should keep its node visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layout, canvasWidth]);

  const edges: MapEdge[] = useMemo(() => {
    if (!layout) return [];
    const current = new Map(graph.edges.map((edge) => [edge.id, edge]));
    return layout.edges
      .filter((edge) => current.has(edge.id))
      .map((edge) => {
        const route = { ...edge, ...current.get(edge.id)! };
        const selected = Boolean(
          selectedId &&
            (edge.source === selectedId || edge.target === selectedId),
        );
        const colour = selected
          ? "#4054a5"
          : edge.kind === "feedback"
            ? "#b2a07c"
            : "#98a5b6";
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "routed",
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          data: { route },
          style: {
            stroke: colour,
            strokeWidth: selected ? 2 : 1.5,
            strokeDasharray:
              edge.kind === "feedback"
                ? "5 5"
                : edge.kind === "reference"
                  ? "2 4"
                  : undefined,
            opacity: focus && selectedId && !selected ? 0.18 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: colour,
          },
          ariaLabel: route.label || "Connection between nodes",
        };
      });
  }, [layout, graph.edges, selectedId, focus]);

  const move = useCallback(
    async (_event: unknown, node: MapNode) => {
      try {
        await onMove(node.id, node.position);
      } catch {
        const saved = layout?.nodes.find((item) => item.id === node.id);
        if (saved)
          setNodes((current) =>
            current.map((item) =>
              item.id === node.id
                ? { ...item, position: saved.position }
                : item,
            ),
          );
      }
    },
    [layout, onMove, setNodes],
  );
  return (
    <div
      className={`diagram-canvas ${editing ? "canvas-editing" : ""}`}
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.matches("input,textarea,select,button,a")) return;
        if (event.key === "Enter" || event.key === " ") {
          const id = target.dataset.id;
          if (id && target.classList.contains("react-flow__node")) {
            event.preventDefault();
            event.stopPropagation();
            onSelect(id);
          }
          if (id && target.classList.contains("react-flow__edge")) {
            event.preventDefault();
            event.stopPropagation();
            const edge = edges.find((item) => item.id === id);
            if (edge) onEdge(edge.data!.route.originalIds);
          }
        } else if (
          editing &&
          target.classList.contains("react-flow__node") &&
          ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat) return;
          const node = flow.getNode(target.dataset.id!);
          if (node) {
            const distance = event.shiftKey ? 40 : 10;
            const position = {
              x:
                node.position.x +
                (event.key === "ArrowRight"
                  ? distance
                  : event.key === "ArrowLeft"
                    ? -distance
                    : 0),
              y:
                node.position.y +
                (event.key === "ArrowDown"
                  ? distance
                  : event.key === "ArrowUp"
                    ? -distance
                    : 0),
            };
            void onMove(node.id, position).catch(() => {
              /* Workspace keeps the failed save visible. */
            });
          }
        } else if (event.key === "Escape") onSelect(null);
        else if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          flow.fitView({ padding: 0.13, maxZoom: 1, duration: 240 });
        }
      }}
    >
      <ReactFlow<MapNode, MapEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable={editing}
        nodesConnectable={editing}
        connectionMode={ConnectionMode.Loose}
        onConnect={onConnect}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onNodeDoubleClick={(_event, node) => {
          if (node.data.item.childCount) onDrill(node.id);
        }}
        onPaneClick={() => onSelect(null)}
        onEdgeClick={(_event, edge) => onEdge(edge.data!.route.originalIds)}
        onNodeDragStop={move}
        minZoom={0.15}
        maxZoom={1.7}
        fitView={false}
        deleteKeyCode={null}
        selectionOnDrag={false}
        ariaLabelConfig={{
          "controls.zoomIn.ariaLabel": "Zoom in",
          "controls.zoomOut.ariaLabel": "Zoom out",
          "controls.fitView.ariaLabel": "Fit to screen",
          "node.a11yDescription.default":
            "Press Enter or Space to select.",
          "minimap.ariaLabel": "Map overview",
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#d9e1ed"
        />
        {showMinimap && (
          <MiniMap
            nodeColor="#b3bed1"
            maskColor="rgba(246,248,252,.7)"
            pannable
            zoomable
            position="bottom-right"
          />
        )}
      </ReactFlow>
      <CanvasControls
        showMinimap={showMinimap}
        setShowMinimap={setShowMinimap}
      />
      <div className="canvas-reading-hint">
        <ArrowDownRight size={14} />
        {editing
          ? "Drag nodes to move them. Join their handles to connect them."
          : "Pan to explore · Double-click to open a phase"}
      </div>
      {(!layout || layoutError) && (
        <div className="canvas-loading" role="status">
          {layoutError ? (
            "Could not lay out the map. You can use the list view."
          ) : (
            <>
              <Focus size={22} />
              <span>Laying out map…</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiagramCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasScene {...props} />
    </ReactFlowProvider>
  );
}
