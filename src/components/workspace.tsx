"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Eye,
  FilePenLine,
  GitBranch,
  History,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { Connection } from "@xyflow/react";
import type {
  DiagramContent,
  DiagramEdge,
  DiagramNode,
  DiagramRecord,
  DiagramSummary,
} from "@/lib/diagrams/schema";
import type { DiagramOperation } from "@/lib/diagrams/patch";
import { api, ApiError } from "@/lib/http/client";
import {
  breadcrumbsFor,
  projectGraph,
  searchNodes,
} from "@/lib/graph/projection";
import { Collection } from "./collection";
import { NodeInspector, EdgeInspector } from "./node-inspector";
import { DiagramEditor, EdgeEditor, ImportDialog, NodeEditor } from "./editors";
import { ConnectionsDialog, HistoryDialog } from "./workspace-dialogs";

const DiagramCanvas = dynamic(() => import("./diagram-canvas"), {
  ssr: false,
  loading: () => (
    <div className="canvas-loading">
      <LoaderCircle className="spin" size={22} />
      <span>Opening map…</span>
    </div>
  ),
});
type Modal =
  | { type: "new" | "metadata" | "import" | "connections" | "history" }
  | { type: "node"; node?: DiagramNode; parentId: string | null }
  | { type: "edge"; edge?: DiagramEdge; source?: string; target?: string }
  | null;
interface Notice {
  text: string;
  error?: boolean;
}

export function Workspace({
  initialDiagrams,
  initialRecord,
  userName,
}: {
  initialDiagrams: DiagramSummary[];
  initialRecord: DiagramRecord | null;
  userName: string;
}) {
  const [diagrams, setDiagrams] = useState(initialDiagrams);
  const [record, setRecord] = useState(initialRecord);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edgeIds, setEdgeIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [focus, setFocus] = useState(false);
  const [showFeedback, setShowFeedback] = useState(true);
  const [view, setView] = useState<"map" | "list">("map");
  const [nodeQuery, setNodeQuery] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [menu, setMenu] = useState(false);
  const activeId = useRef(initialRecord?.id);
  const navigationVersion = useRef(0);
  const savingNow = useRef(false);
  const currentRecord = useRef(record);
  const recordId = record?.id;
  const showError = useCallback(
    (failure: unknown) =>
      setNotice({
        text:
          failure instanceof Error ? failure.message : "Could not complete the request.",
        error: true,
      }),
    [],
  );
  const refreshCollection = useCallback(
    async (search = query, inArchive = archived) => {
      const result = await api<DiagramSummary[]>(
        `/api/diagrams?search=${encodeURIComponent(search)}&archived=${inArchive}`,
      );
      setDiagrams(result);
    },
    [query, archived],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api<DiagramSummary[]>(
        `/api/diagrams?search=${encodeURIComponent(query)}&archived=${archived}`,
        { signal: controller.signal },
      )
        .then(setDiagrams)
        .catch((failure) => {
          if (failure.name !== "AbortError") showError(failure);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, archived, showError]);

  const acceptRecord = useCallback(
    (next: DiagramRecord, navigation = navigationVersion.current) => {
      const current = currentRecord.current;
      if (
        navigation !== navigationVersion.current ||
        next.id !== activeId.current ||
        (current?.id === next.id && current.revision > next.revision)
      )
        return false;
      currentRecord.current = next;
      setRecord(next);
      setSelectedId((value) =>
        value && next.document.nodes.some((node) => node.id === value)
          ? value
          : null,
      );
      setScopeId((value) =>
        value && next.document.nodes.some((node) => node.id === value)
          ? value
          : null,
      );
      setEdgeIds((value) =>
        value.filter((id) =>
          next.document.edges.some((edge) => edge.id === id),
        ),
      );
      return true;
    },
    [],
  );

  const openDiagram = useCallback(
    async (id: string) => {
      const navigation = ++navigationVersion.current;
      activeId.current = id;
      setOpening(true);
      setSelectedId(null);
      setEdgeIds([]);
      setScopeId(null);
      setFocus(false);
      setEditing(false);
      setNodeQuery("");
      try {
        const next = await api<DiagramRecord>(`/api/diagrams/${id}`);
        if (acceptRecord(next, navigation)) {
          window.history.replaceState(null, "", `/?diagram=${id}`);
        }
      } catch (failure) {
        if (navigationVersion.current === navigation) {
          activeId.current = currentRecord.current?.id;
          showError(failure);
        }
      } finally {
        if (navigationVersion.current === navigation) setOpening(false);
      }
    },
    [acceptRecord, showError],
  );

  useEffect(() => {
    if (editing || modal || !recordId) return;
    let running = false;
    const refresh = async () => {
      if (
        document.visibilityState !== "visible" ||
        running ||
        savingNow.current
      )
        return;
      running = true;
      const id = activeId.current;
      const navigation = navigationVersion.current;
      try {
        const next = await api<DiagramRecord>(`/api/diagrams/${id}`);
        if (
          id === activeId.current &&
          next.revision > (currentRecord.current?.revision ?? 0)
        ) {
          if (acceptRecord(next, navigation))
            setNotice({ text: "Opened the new revision saved by your agent." });
          await refreshCollection();
        }
      } catch {
        /* Keep the confirmed current record; explicit refresh exposes errors. */
      } finally {
        running = false;
      }
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [editing, modal, recordId, acceptRecord, refreshCollection]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as Element).closest(".diagram-menu")) setMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const savePatch = useCallback(
    async (operations: DiagramOperation[], mutationId: string) => {
      const current = currentRecord.current;
      if (!current) throw new Error("Open a diagram first.");
      if (current.id !== activeId.current)
        throw new Error("The diagram is opening. Try again when it is ready.");
      const navigation = navigationVersion.current;
      if (savingNow.current)
        throw new Error("A save is in progress. Try again when it is complete.");
      savingNow.current = true;
      setSaving(true);
      try {
        const next = await api<DiagramRecord>(`/api/diagrams/${current.id}`, {
          method: "PATCH",
          body: { expectedRevision: current.revision, operations },
          mutationId,
        });
        if (acceptRecord(next, navigation))
          setNotice({ text: "Changes saved." });
        void refreshCollection().catch(() =>
          setNotice({
            text: "Map saved. Refresh the collection to update the list.",
            error: true,
          }),
        );
      } catch (failure) {
        if (
          failure instanceof ApiError &&
          failure.code === "REVISION_CONFLICT"
        ) {
          const next = await api<DiagramRecord>(`/api/diagrams/${current.id}`);
          acceptRecord(next, navigation);
        }
        throw failure;
      } finally {
        savingNow.current = false;
        setSaving(false);
      }
    },
    [acceptRecord, refreshCollection],
  );

  const goToNode = useCallback((id: string) => {
    const node = currentRecord.current?.document.nodes.find(
      (item) => item.id === id,
    );
    if (!node) return;
    setScopeId(node.parentId ?? null);
    setSelectedId(id);
    setEdgeIds([]);
    setNodeQuery("");
    setFocus(false);
  }, []);
  const drill = useCallback((id: string) => {
    setScopeId(id);
    setSelectedId(null);
    setEdgeIds([]);
    setFocus(false);
    setNodeQuery("");
  }, []);
  const selectNode = useCallback((id: string | null) => {
    setSelectedId(id);
    setEdgeIds([]);
  }, []);
  const selectEdge = useCallback((ids: string[]) => {
    setEdgeIds(ids);
    setSelectedId(null);
    setFocus(false);
  }, []);
  const connect = useCallback((connection: Connection) => {
    if (connection.source && connection.target)
      setModal({
        type: "edge",
        source: connection.source,
        target: connection.target,
      });
  }, []);
  const move = useCallback(
    async (id: string, position: { x: number; y: number }) => {
      try {
        await savePatch(
          [{ op: "update_node", id, changes: { position } }],
          crypto.randomUUID(),
        );
      } catch (failure) {
        showError(failure);
        throw failure;
      }
    },
    [savePatch, showError],
  );

  async function addRecord(next: DiagramRecord, navigation: number) {
    if (navigation !== navigationVersion.current) {
      await refreshCollection().catch(() => {});
      return;
    }
    navigationVersion.current++;
    activeId.current = next.id;
    currentRecord.current = next;
    setRecord(next);
    setScopeId(null);
    setSelectedId(null);
    setEdgeIds([]);
    setEditing(false);
    setQuery("");
    setArchived(false);
    window.history.replaceState(null, "", `/?diagram=${next.id}`);
    await refreshCollection("", false).catch(() => {});
    setNotice({ text: "Diagram saved." });
  }
  async function createRecord(
    path: string,
    body?: unknown,
    mutationId?: string,
  ) {
    const navigation = navigationVersion.current;
    const next = await api<DiagramRecord>(path, {
      method: "POST",
      body,
      mutationId,
    });
    await addRecord(next, navigation);
  }
  async function exportRecord() {
    if (!record) return;
    try {
      const value = await api(`/api/diagrams/${record.id}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${record.title.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")}.mefagram.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      showError(failure);
    }
  }

  const selected = record?.document.nodes.find(
    (node) => node.id === selectedId,
  );
  const breadcrumbs = useMemo(
    () => (record && scopeId ? breadcrumbsFor(record.document, scopeId) : []),
    [record, scopeId],
  );
  const results = useMemo(
    () => (record ? searchNodes(record.document, nodeQuery).slice(0, 20) : []),
    [record, nodeQuery],
  );
  const visible = useMemo(
    () =>
      record ? projectGraph(record.document, { scopeId, showFeedback }) : null,
    [record, scopeId, showFeedback],
  );
  const closeModal = () =>
    setModal((current) => (current === modal ? null : current));
  const viewScope = breadcrumbs.at(-1);

  return (
    <div className="app-shell">
      <Collection
        diagrams={diagrams}
        activeId={record?.id}
        query={query}
        onQuery={setQuery}
        archived={archived}
        onArchive={setArchived}
        loading={loading}
        onOpen={openDiagram}
        onNew={() => setModal({ type: "new" })}
        onImport={() => setModal({ type: "import" })}
        onConnect={() => setModal({ type: "connections" })}
        userName={userName}
      />
      <main className="main-workspace">
        {record ? (
          <>
            <header className="document-header">
              <div className="document-breadcrumb">
                <BookOpen size={14} />
                <span>Diagrams</span>
                <ChevronRight size={13} />
                <span>{record.tags[0] ?? "Workflow map"}</span>
                <div className="header-save-status" role="status">
                  {saving ? (
                    <>
                      <LoaderCircle className="spin" size={13} />
                      Saving
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      Saved
                    </>
                  )}
                </div>
              </div>
              <div className="document-title-row">
                <div>
                  <h1>{record.title}</h1>
                  <p>{record.description}</p>
                </div>
                <div className="document-actions">
                  <button
                    className={`button small ${editing ? "edit-active" : ""}`}
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? <Eye size={14} /> : <Pencil size={14} />}
                    <span>{editing ? "Back to reading" : "Edit"}</span>
                  </button>
                  <div className="diagram-menu">
                    <button
                      className="icon-button"
                      onClick={() => setMenu(!menu)}
                      aria-label="Diagram actions"
                      aria-expanded={menu}
                    >
                      <MoreHorizontal size={20} />
                    </button>
                    {menu && (
                      <div role="menu" className="menu-popover">
                        <button
                          role="menuitem"
                          onClick={() => {
                            setModal({ type: "metadata" });
                            setMenu(false);
                          }}
                        >
                          <FilePenLine size={15} />
                          Diagram details
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setModal({ type: "history" });
                            setMenu(false);
                          }}
                        >
                          <History size={15} />
                          Revision history
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            void exportRecord();
                            setMenu(false);
                          }}
                        >
                          <Download size={15} />
                          Export as JSON
                        </button>
                        <button
                          role="menuitem"
                          onClick={async () => {
                            setMenu(false);
                            try {
                              await savePatch(
                                [
                                  {
                                    op: "update_metadata",
                                    changes: { archived: !record.archived },
                                  },
                                ],
                                crypto.randomUUID(),
                              );
                            } catch (failure) {
                              showError(failure);
                            }
                          }}
                        >
                          <Archive size={15} />
                          {record.archived ? "Unarchive" : "Archive"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="document-meta">
                <span className="diagram-type">
                  <GitBranch size={13} />
                  Workflow map
                </span>
                <span>
                  {record.document.nodes.length}{" "}
                  {record.document.nodes.length === 1 ? "node" : "nodes"}
                </span>
                <span>
                  {record.document.edges.length}{" "}
                  {record.document.edges.length === 1 ? "connection" : "connections"}
                </span>
                {record.tags.includes("Starter draft") && (
                  <span className="draft-label">Starter draft</span>
                )}
                {record.archived && (
                  <span className="draft-label">Archived</span>
                )}
              </div>
            </header>
            <div className="workspace-content">
              <section className="map-workspace" aria-label="Diagram view">
                <div className="map-toolbar">
                  <div className="view-tabs">
                    <button
                      className={view === "map" ? "active" : ""}
                      onClick={() => setView("map")}
                    >
                      <LayoutGrid size={14} />
                      Map
                    </button>
                    <button
                      className={view === "list" ? "active" : ""}
                      onClick={() => setView("list")}
                    >
                      <List size={15} />
                      List
                    </button>
                  </div>
                  <div className="map-search">
                    <Search size={15} />
                    <input
                      aria-label="Search map"
                      value={nodeQuery}
                      onChange={(event) => setNodeQuery(event.target.value)}
                      placeholder="Search map"
                    />
                    {nodeQuery && (
                      <button
                        className="icon-button"
                        aria-label="Clear node search"
                        onClick={() => setNodeQuery("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                    {nodeQuery.trim() && (
                      <div
                        className="node-search-results"
                        role="listbox"
                        aria-label="Node search results"
                      >
                        {results.map((node) => (
                          <button
                            key={node.id}
                            role="option"
                            aria-selected={selectedId === node.id}
                            onClick={() => goToNode(node.id)}
                          >
                            <Search size={13} />
                            <span>
                              <strong>{node.label}</strong>
                              <small>
                                {node.parentId
                                  ? record.document.nodes.find(
                                      (parent) => parent.id === node.parentId,
                                    )?.label
                                  : "Overview"}
                              </small>
                            </span>
                            <ArrowUpRight size={13} />
                          </button>
                        ))}
                        {!results.length && <p>No matching nodes.</p>}
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-button refresh-button"
                    title="Open latest save"
                    aria-label="Refresh diagram"
                    onClick={async () => {
                      const navigation = navigationVersion.current;
                      try {
                        const next = await api<DiagramRecord>(
                          `/api/diagrams/${record.id}`,
                        );
                        if (acceptRecord(next, navigation))
                          setNotice({ text: "Opened the latest saved revision." });
                      } catch (failure) {
                        showError(failure);
                      }
                    }}
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
                <div className="scope-bar">
                  {scopeId ? (
                    <>
                      <button
                        className="scope-back"
                        aria-label="Back to overview"
                        onClick={() => {
                          setScopeId(null);
                          setSelectedId(null);
                          setEdgeIds([]);
                          setFocus(false);
                        }}
                      >
                        <ArrowLeft size={14} />
                        Overview
                      </button>
                      {breadcrumbs.map((node) => (
                        <span key={node.id} className="scope-crumb">
                          <ChevronRight size={12} />
                          <button onClick={() => drill(node.id)}>
                            {node.label}
                          </button>
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="scope-label">
                      <Network size={14} />
                      Overview
                      <span>
                        {visible?.nodes.length}{" "}
                        {visible?.nodes.length === 1 ? "main step" : "main steps"}
                      </span>
                    </span>
                  )}
                  <label className="feedback-toggle">
                    <input
                      type="checkbox"
                      checked={showFeedback}
                      onChange={(event) =>
                        setShowFeedback(event.target.checked)
                      }
                    />
                    <span>Feedback</span>
                  </label>
                </div>
                {editing && (
                  <div className="edit-toolbar">
                    <span>
                      <Pencil size={13} />
                      Editing enabled
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        setModal({ type: "node", parentId: scopeId })
                      }
                    >
                      <Plus size={14} />
                      Add node
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        setModal({
                          type: "edge",
                          source: selectedId ?? undefined,
                        })
                      }
                      disabled={record.document.nodes.length < 1}
                    >
                      <Link2 size={14} />
                      Add connection
                    </button>
                    <button
                      className="text-button"
                      onClick={async () => {
                        const operations: DiagramOperation[] =
                          record.document.nodes
                            .filter((node) => node.position)
                            .map((node) => ({
                              op: "update_node",
                              id: node.id,
                              changes: { position: null },
                            }));
                        if (!operations.length) return;
                        try {
                          for (
                            let offset = 0;
                            offset < operations.length;
                            offset += 500
                          )
                            await savePatch(
                              operations.slice(offset, offset + 500),
                              crypto.randomUUID(),
                            );
                        } catch (failure) {
                          showError(failure);
                        }
                      }}
                    >
                      <RefreshCw size={13} />
                      Reset layout
                    </button>
                  </div>
                )}
                <div className="map-surface">
                  {viewScope && (
                    <div className="scope-description">
                      {viewScope.description}
                    </div>
                  )}
                  {!visible?.nodes.length ? (
                    <div className="map-empty">
                      <Network size={36} />
                      <h2>Your map starts here.</h2>
                      <p>
                        Your agent can add nodes and connections.
                        <br />
                        You can also add your first step in edit mode.
                      </p>
                      <button
                        className="button"
                        onClick={() => {
                          setEditing(true);
                          setModal({ type: "node", parentId: scopeId });
                        }}
                      >
                        <Plus size={15} />
                        Add first node
                      </button>
                    </div>
                  ) : view === "map" ? (
                    <DiagramCanvas
                      document={record.document}
                      scopeId={scopeId}
                      selectedId={selectedId}
                      editing={editing}
                      focus={focus}
                      showFeedback={showFeedback}
                      onSelect={selectNode}
                      onDrill={drill}
                      onEdge={selectEdge}
                      onConnect={connect}
                      onMove={move}
                    />
                  ) : (
                    <div className="node-reading-list">
                      {visible.nodes.map((node) => (
                        <article
                          key={node.id}
                          className={`reading-row ${selectedId === node.id ? "active" : ""}`}
                        >
                          <button onClick={() => selectNode(node.id)}>
                            <span
                              className={`reading-node-icon tone-${node.colourIndex}`}
                            >
                              <GitBranch size={18} />
                            </span>
                            <span>
                              <h3>{node.label}</h3>
                              <p>{node.description}</p>
                            </span>
                          </button>
                          {node.childCount > 0 && (
                            <button
                              className="text-button"
                              aria-label={`Open ${node.label} phase`}
                              onClick={() => drill(node.id)}
                            >
                              {node.childCount}{" "}
                              {node.childCount === 1 ? "child step" : "child steps"}
                              <ChevronRight size={14} />
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                  {opening && (
                    <div className="opening-overlay" role="status">
                      <LoaderCircle className="spin" size={22} />
                      Opening diagram…
                    </div>
                  )}
                </div>
                <footer className="map-footer">
                  <span>
                    {editing
                      ? "Changes appear after the save is confirmed."
                      : "Reading mode"}
                    <span className="footer-divider" />
                    Revision {record.revision}
                  </span>
                  <div className="map-legend">
                    <span>
                      <i />
                      Flow
                    </span>
                    {showFeedback && (
                      <span>
                        <i className="feedback-line" />
                        Feedback
                      </span>
                    )}
                  </div>
                </footer>
              </section>
              {selected && (
                <NodeInspector
                  record={record}
                  node={selected}
                  editing={editing}
                  focus={focus}
                  onClose={() => {
                    setSelectedId(null);
                    setFocus(false);
                  }}
                  onEdit={() =>
                    setModal({
                      type: "node",
                      node: selected,
                      parentId: selected.parentId ?? null,
                    })
                  }
                  onSelect={goToNode}
                  onDrill={drill}
                  onFocus={() => setFocus(!focus)}
                  onEditEdge={(edge) => setModal({ type: "edge", edge })}
                />
              )}
              {!selected && edgeIds.length > 0 && (
                <EdgeInspector
                  record={record}
                  ids={edgeIds}
                  editing={editing}
                  onClose={() => setEdgeIds([])}
                  onSelect={goToNode}
                  onEdit={(edge) => setModal({ type: "edge", edge })}
                />
              )}
            </div>
          </>
        ) : (
          <section className="welcome-empty">
            <div className="welcome-symbol">
              <Network size={44} />
            </div>
            <h1>Give your ideas a map.</h1>
            <p>
              Your processes, projects and ideas,
              <br />
              together in your private workspace.
            </p>
            <div>
              <button
                className="button primary"
                onClick={() => setModal({ type: "new" })}
              >
                <Plus size={16} />
                New diagram
              </button>
              <button
                className="button"
                onClick={async () => {
                  try {
                    await createRecord("/api/templates/newsletter");
                  } catch (failure) {
                    showError(failure);
                  }
                }}
              >
                Open fictional example
              </button>
            </div>
          </section>
        )}
      </main>
      {notice && (
        <div
          className={`notice ${notice.error ? "notice-error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {!notice.error && <Check size={15} />}
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal?.type === "new" && (
        <DiagramEditor
          onClose={closeModal}
          onCreate={async (content: DiagramContent, mutationId) =>
            createRecord("/api/diagrams", content, mutationId)
          }
        />
      )}
      {modal?.type === "metadata" && record && (
        <DiagramEditor
          record={record}
          onClose={closeModal}
          onUpdate={savePatch}
        />
      )}
      {modal?.type === "node" && record && (
        <NodeEditor
          record={record}
          node={modal.node}
          parentId={modal.parentId}
          onClose={closeModal}
          onSave={savePatch}
        />
      )}
      {modal?.type === "edge" && record && (
        <EdgeEditor
          record={record}
          edge={modal.edge}
          source={modal.source}
          target={modal.target}
          onClose={closeModal}
          onSave={savePatch}
        />
      )}
      {modal?.type === "import" && (
        <ImportDialog
          onClose={closeModal}
          onImport={async (value, mutationId) =>
            createRecord("/api/diagrams/import", value, mutationId)
          }
        />
      )}
      {modal?.type === "connections" && (
        <ConnectionsDialog onClose={closeModal} />
      )}
      {modal?.type === "history" && record && (
        <HistoryDialog
          record={record}
          onClose={closeModal}
          onRestore={async (revision) => {
            const navigation = navigationVersion.current;
            const next = await api<DiagramRecord>(
              `/api/diagrams/${record.id}/restore`,
              {
                method: "POST",
                body: { revision, expectedRevision: record.revision },
              },
            );
            const displayed = acceptRecord(next, navigation);
            await refreshCollection().catch(() => {});
            if (displayed)
              setNotice({
                text: "Restored the earlier revision as a new save.",
              });
          }}
        />
      )}
    </div>
  );
}
