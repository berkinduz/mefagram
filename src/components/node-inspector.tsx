"use client";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  ExternalLink,
  FileText,
  Layers3,
  Pencil,
  X,
} from "lucide-react";
import type {
  DiagramNode,
  DiagramRecord,
  DiagramEdge,
} from "@/lib/diagrams/schema";

const kindLabels = {
  phase: "Aşama",
  step: "Adım",
  decision: "Karar",
  note: "Not",
  result: "Çıktı",
};
export function NodeInspector({
  record,
  node,
  editing,
  focus,
  onClose,
  onEdit,
  onSelect,
  onDrill,
  onFocus,
  onEditEdge,
}: {
  record: DiagramRecord;
  node: DiagramNode;
  editing: boolean;
  focus: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSelect: (id: string) => void;
  onDrill: (id: string) => void;
  onFocus: () => void;
  onEditEdge: (edge: DiagramEdge) => void;
}) {
  const children = record.document.nodes.filter(
    (item) => item.parentId === node.id,
  );
  const related = record.document.edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  const byId = new Map(record.document.nodes.map((item) => [item.id, item]));
  return (
    <aside className="inspector" aria-label="Düğüm detayları">
      <div className="inspector-top">
        <span className="inspector-kind">
          <Layers3 size={14} />
          {kindLabels[node.kind]}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Detayları kapat"
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-scroll">
        <h2>{node.label}</h2>
        <p className="node-description">
          {node.description || "Bu düğümün açıklaması henüz eklenmedi."}
        </p>
        <div className="inspector-actions">
          <button
            className={`button small ${focus ? "active" : ""}`}
            aria-pressed={focus}
            onClick={onFocus}
          >
            <Crosshair size={14} />
            {focus ? "Odağı kaldır" : "Bağlantılara odaklan"}
          </button>
          {editing && (
            <button
              className="button small"
              onClick={onEdit}
              aria-label="Düğümü düzenle"
            >
              <Pencil size={14} />
              Düzenle
            </button>
          )}
        </div>
        {children.length > 0 && (
          <section className="inspector-section">
            <div className="section-row">
              <h3>
                Alt adımlar<span>{children.length}</span>
              </h3>
              <button className="text-button" onClick={() => onDrill(node.id)}>
                Haritada aç
                <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="child-list">
              {children.map((child, index) => (
                <button key={child.id} onClick={() => onSelect(child.id)}>
                  <span className="child-step">{index + 1}</span>
                  <span>{child.label}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="inspector-section">
          <h3>
            <FileText size={14} />
            Notlar
          </h3>
          <div className={`prose-note ${node.notes ? "" : "muted"}`}>
            {node.notes || "Henüz not eklenmedi."}
          </div>
        </section>
        <section className="inspector-section">
          <h3>
            Kaynaklar<span>{node.sources.length}</span>
          </h3>
          {node.sources.length ? (
            <div className="source-list">
              {node.sources.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>
                    <strong>{source.label}</strong>
                    <small>{new URL(source.url).hostname}</small>
                  </span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          ) : (
            <p className="muted small-copy">
              Bu düğüme henüz kaynak eklenmedi.
            </p>
          )}
        </section>
        {related.length > 0 && (
          <section className="inspector-section">
            <h3>
              Bağlantılar<span>{related.length}</span>
            </h3>
            <div className="relation-list">
              {related.map((edge) => {
                const outgoing = edge.source === node.id;
                const other = byId.get(outgoing ? edge.target : edge.source);
                return (
                  <div className="relation-row" key={edge.id}>
                    <button onClick={() => onSelect(other?.id ?? node.id)}>
                      {outgoing ? (
                        <ArrowUpRight size={14} />
                      ) : (
                        <ArrowDownLeft size={14} />
                      )}
                      <span>
                        {other?.label}
                        <small>
                          {edge.label ||
                            (edge.kind === "feedback"
                              ? "Geri besleme"
                              : edge.kind === "reference"
                                ? "İlişki"
                                : outgoing
                                  ? "Sonraki adım"
                                  : "Önceki adım")}
                        </small>
                      </span>
                    </button>
                    {editing && (
                      <button
                        className="icon-button"
                        onClick={() => onEditEdge(edge)}
                        aria-label="Bağlantıyı düzenle"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {node.tags.length > 0 && (
          <div className="tag-list inspector-tags">
            {node.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
      <footer className="inspector-footer">
        <span>Kaydedilmiş sürüm {record.revision}</span>
        <span className="saved-dot" />
        Güncel
      </footer>
    </aside>
  );
}

export function EdgeInspector({
  record,
  ids,
  editing,
  onClose,
  onSelect,
  onEdit,
}: {
  record: DiagramRecord;
  ids: string[];
  editing: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: (edge: DiagramEdge) => void;
}) {
  const edges = record.document.edges.filter((edge) => ids.includes(edge.id));
  const byId = new Map(record.document.nodes.map((node) => [node.id, node]));
  return (
    <aside className="inspector" aria-label="Bağlantı detayları">
      <div className="inspector-top">
        <span className="inspector-kind">
          <ArrowRight size={14} />
          Bağlantı
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Detayları kapat"
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-scroll">
        <h2>Adımlar arasındaki ilişki</h2>
        <p className="node-description">
          Genel bakışta aynı aşamalar arasındaki bağlantılar birlikte
          gösterilir.
        </p>
        {edges.map((edge) => (
          <section className="inspector-section" key={edge.id}>
            <div className="edge-endpoints">
              <button onClick={() => onSelect(edge.source)}>
                {byId.get(edge.source)?.label}
              </button>
              <ArrowRight size={16} />
              <button onClick={() => onSelect(edge.target)}>
                {byId.get(edge.target)?.label}
              </button>
            </div>
            <p>{edge.label || "Bağlantı adı eklenmedi."}</p>
            <span className="tag-list">
              <span>
                {edge.kind === "feedback"
                  ? "Geri besleme"
                  : edge.kind === "reference"
                    ? "İlişki"
                    : "Akış"}
              </span>
            </span>
            {editing && (
              <button
                className="button small edge-edit-button"
                onClick={() => onEdit(edge)}
              >
                <Pencil size={14} />
                Bağlantıyı düzenle
              </button>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}
