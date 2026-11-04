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
      <span>Harita açılıyor…</span>
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
  const savingNow = useRef(false);
  const currentRecord = useRef(record);
  const recordId = record?.id;
  useEffect(() => {
    currentRecord.current = record;
  }, [record]);
  const showError = useCallback(
    (failure: unknown) =>
      setNotice({
        text:
          failure instanceof Error ? failure.message : "İşlem tamamlanamadı.",
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

  const acceptRecord = useCallback((next: DiagramRecord) => {
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
      value.filter((id) => next.document.edges.some((edge) => edge.id === id)),
    );
  }, []);

  const openDiagram = useCallback(
    async (id: string) => {
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
        if (activeId.current === id) {
          acceptRecord(next);
          window.history.replaceState(null, "", `/?diagram=${id}`);
        }
      } catch (failure) {
        showError(failure);
      } finally {
        if (activeId.current === id) setOpening(false);
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
      try {
        const next = await api<DiagramRecord>(`/api/diagrams/${id}`);
        if (
          id === activeId.current &&
          next.revision > (currentRecord.current?.revision ?? 0)
        ) {
          acceptRecord(next);
          setNotice({ text: "Agentın kaydettiği yeni sürüm açıldı." });
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
      if (!current) throw new Error("Önce bir diyagram aç.");
      if (savingNow.current)
        throw new Error("Önceki kayıt sürüyor. Tamamlanınca yeniden dene.");
      savingNow.current = true;
      setSaving(true);
      try {
        const next = await api<DiagramRecord>(`/api/diagrams/${current.id}`, {
          method: "PATCH",
          body: { expectedRevision: current.revision, operations },
          mutationId,
        });
        currentRecord.current = next;
        acceptRecord(next);
        setNotice({ text: "Değişiklikler kaydedildi." });
        void refreshCollection().catch(() =>
          setNotice({
            text: "Harita kaydedildi. Koleksiyon listesini yenileyebilirsin.",
            error: true,
          }),
        );
      } catch (failure) {
        if (
          failure instanceof ApiError &&
          failure.code === "REVISION_CONFLICT"
        ) {
          const next = await api<DiagramRecord>(`/api/diagrams/${current.id}`);
          currentRecord.current = next;
          acceptRecord(next);
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

  async function addRecord(next: DiagramRecord) {
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
    setNotice({ text: "Diyagram kaydedildi." });
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
      anchor.download = `${record.title.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ığüşöç]+/g, "-")}.mefagram.json`;
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
  const closeModal = () => setModal(null);
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
                <span>Diyagramlar</span>
                <ChevronRight size={13} />
                <span>{record.tags[0] ?? "Çalışma haritası"}</span>
                <div className="header-save-status" role="status">
                  {saving ? (
                    <>
                      <LoaderCircle className="spin" size={13} />
                      Kaydediliyor
                    </>
                  ) : (
                    <>
                      <Check size={13} />
                      Kaydedildi
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
                    <span>{editing ? "Okumaya dön" : "Düzenle"}</span>
                  </button>
                  <div className="diagram-menu">
                    <button
                      className="icon-button"
                      onClick={() => setMenu(!menu)}
                      aria-label="Diyagram işlemleri"
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
                          Diyagram bilgileri
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setModal({ type: "history" });
                            setMenu(false);
                          }}
                        >
                          <History size={15} />
                          Sürüm geçmişi
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            void exportRecord();
                            setMenu(false);
                          }}
                        >
                          <Download size={15} />
                          JSON olarak dışa aktar
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
                          {record.archived ? "Arşivden çıkar" : "Arşive taşı"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="document-meta">
                <span className="diagram-type">
                  <GitBranch size={13} />
                  Çalışma haritası
                </span>
                <span>{record.document.nodes.length} düğüm</span>
                <span>{record.document.edges.length} bağlantı</span>
                {record.tags.includes("Başlangıç taslağı") && (
                  <span className="draft-label">Başlangıç taslağı</span>
                )}
                {record.archived && (
                  <span className="draft-label">Arşivde</span>
                )}
              </div>
            </header>
            <div className="workspace-content">
              <section className="map-workspace" aria-label="Diyagram görünümü">
                <div className="map-toolbar">
                  <div className="view-tabs">
                    <button
                      className={view === "map" ? "active" : ""}
                      onClick={() => setView("map")}
                    >
                      <LayoutGrid size={14} />
                      Harita
                    </button>
                    <button
                      className={view === "list" ? "active" : ""}
                      onClick={() => setView("list")}
                    >
                      <List size={15} />
                      Liste
                    </button>
                  </div>
                  <div className="map-search">
                    <Search size={15} />
                    <input
                      aria-label="Haritada ara"
                      value={nodeQuery}
                      onChange={(event) => setNodeQuery(event.target.value)}
                      placeholder="Haritada ara"
                    />
                    {nodeQuery && (
                      <button
                        className="icon-button"
                        aria-label="Düğüm aramasını temizle"
                        onClick={() => setNodeQuery("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                    {nodeQuery.trim() && (
                      <div
                        className="node-search-results"
                        role="listbox"
                        aria-label="Düğüm arama sonuçları"
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
                                  : "Genel harita"}
                              </small>
                            </span>
                            <ArrowUpRight size={13} />
                          </button>
                        ))}
                        {!results.length && <p>Eşleşen düğüm yok.</p>}
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-button refresh-button"
                    title="Son kaydı aç"
                    aria-label="Diyagramı yenile"
                    onClick={async () => {
                      try {
                        const next = await api<DiagramRecord>(
                          `/api/diagrams/${record.id}`,
                        );
                        acceptRecord(next);
                        setNotice({ text: "Son kaydedilmiş sürüm açıldı." });
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
                        aria-label="Genel haritaya dön"
                        onClick={() => {
                          setScopeId(null);
                          setSelectedId(null);
                          setEdgeIds([]);
                          setFocus(false);
                        }}
                      >
                        <ArrowLeft size={14} />
                        Genel harita
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
                      Genel bakış<span>{visible?.nodes.length} ana adım</span>
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
                    <span>Geri besleme</span>
                  </label>
                </div>
                {editing && (
                  <div className="edit-toolbar">
                    <span>
                      <Pencil size={13} />
                      Düzenleme açık
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        setModal({ type: "node", parentId: scopeId })
                      }
                    >
                      <Plus size={14} />
                      Düğüm ekle
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
                      Bağlantı ekle
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
                      Yerleşimi yenile
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
                      <h2>Burada bir harita başlayacak.</h2>
                      <p>
                        Agentın düğümleri ve bağlantıları ekleyebilir.
                        <br />
                        Sen de düzenleme modunda ilk adımı oluşturabilirsin.
                      </p>
                      <button
                        className="button"
                        onClick={() => {
                          setEditing(true);
                          setModal({ type: "node", parentId: scopeId });
                        }}
                      >
                        <Plus size={15} />
                        İlk düğümü ekle
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
                              aria-label={`${node.label} aşamasını aç`}
                              onClick={() => drill(node.id)}
                            >
                              {node.childCount} alt adım
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
                      Diyagram açılıyor…
                    </div>
                  )}
                </div>
                <footer className="map-footer">
                  <span>
                    {editing
                      ? "Değişiklikler kayıt onayından sonra görünür."
                      : "Okuma modu"}
                    <span className="footer-divider" />
                    Sürüm {record.revision}
                  </span>
                  <div className="map-legend">
                    <span>
                      <i />
                      Akış
                    </span>
                    {showFeedback && (
                      <span>
                        <i className="feedback-line" />
                        Geri besleme
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
            <h1>Fikirlerine bir harita aç.</h1>
            <p>
              Süreçlerini, projelerini ve düşüncelerini
              <br />
              bir arada görebileceğin kişisel alanın.
            </p>
            <div>
              <button
                className="button primary"
                onClick={() => setModal({ type: "new" })}
              >
                <Plus size={16} />
                Yeni diyagram
              </button>
              <button
                className="button"
                onClick={async () => {
                  try {
                    const next = await api<DiagramRecord>(
                      "/api/templates/mefa-apps",
                      { method: "POST" },
                    );
                    await addRecord(next);
                  } catch (failure) {
                    showError(failure);
                  }
                }}
              >
                Mefa Apps örneğini aç
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
            aria-label="Bildirimi kapat"
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
            addRecord(
              await api<DiagramRecord>("/api/diagrams", {
                method: "POST",
                body: content,
                mutationId,
              }),
            )
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
            addRecord(
              await api<DiagramRecord>("/api/diagrams/import", {
                method: "POST",
                body: value,
                mutationId,
              }),
            )
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
            const next = await api<DiagramRecord>(
              `/api/diagrams/${record.id}/restore`,
              {
                method: "POST",
                body: { revision, expectedRevision: record.revision },
              },
            );
            currentRecord.current = next;
            acceptRecord(next);
            await refreshCollection().catch(() => {});
            setNotice({
              text: "Önceki sürüm yeni bir kayıt olarak geri yüklendi.",
            });
          }}
        />
      )}
    </div>
  );
}
