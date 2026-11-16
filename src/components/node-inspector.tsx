"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Code2,
  Crosshair,
  ExternalLink,
  FileText,
  Layers3,
  Pencil,
  X,
} from "lucide-react";
import type { DiagramComment } from "@/lib/diagrams/comments";
import { NodeComments, type CommentActions } from "./comments";
import type {
  DiagramNode,
  DiagramRecord,
  DiagramEdge,
} from "@/lib/diagrams/schema";

const kindLabels = {
  phase: "Phase",
  step: "Step",
  decision: "Decision",
  note: "Note",
  result: "Result",
};
const EDITORS = {
  vscode: "VS Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  zed: "Zed",
} as const;
type Editor = keyof typeof EDITORS;
const EDITOR_KEY = "mefagram-editor";

function readEditor(): Editor {
  try {
    const value = localStorage.getItem(EDITOR_KEY);
    if (value && value in EDITORS) return value as Editor;
  } catch {
    /* Storage can be unavailable; fall back to VS Code. */
  }
  return "vscode";
}

/** Absolute path for a code reference, or null when it cannot be resolved. */
function absolutePath(path: string, root: string) {
  if (/^(\/|[A-Za-z]:[\\/])/.test(path)) return path;
  if (!root) return null;
  return `${root.replace(/[\\/]+$/, "")}/${path.replace(/^\.?[\\/]/, "")}`;
}

function editorLink(editor: Editor, path: string, line?: number) {
  const normalized = path.replace(/\\/g, "/");
  const slashed = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const suffix = line ? `:${line}` : "";
  return `${editor}://file${encodeURI(slashed)}${suffix}`;
}

function CodeSection({ node, root }: { node: DiagramNode; root: string }) {
  const [editor, setEditor] = useState<Editor>(readEditor);
  return (
    <section className="inspector-section">
      <div className="section-row">
        <h3>
          <Code2 size={14} />
          Code<span>{node.code.length}</span>
        </h3>
        <select
          className="editor-select"
          aria-label="Open code in"
          value={editor}
          onChange={(event) => {
            const next = event.target.value as Editor;
            setEditor(next);
            try {
              localStorage.setItem(EDITOR_KEY, next);
            } catch {
              /* Not persisted; still used for this view. */
            }
          }}
        >
          {Object.entries(EDITORS).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="source-list code-list">
        {node.code.map((ref, index) => {
          const absolute = absolutePath(ref.path, root);
          const text = `${ref.path}${ref.line ? `:${ref.line}` : ""}`;
          const body = (
            <>
              <span>
                <strong>{ref.label || text}</strong>
                {ref.label && <small>{text}</small>}
              </span>
              {absolute && <ExternalLink size={14} />}
            </>
          );
          return absolute ? (
            <a
              key={`${ref.path}-${ref.line}-${index}`}
              href={editorLink(editor, absolute, ref.line)}
              title={`Open in ${EDITORS[editor]}`}
            >
              {body}
            </a>
          ) : (
            <div
              key={`${ref.path}-${ref.line}-${index}`}
              className="code-ref-plain"
              title="Set the diagram's projectRoot to open relative paths"
            >
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
  comments,
  commentActions,
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
  comments: DiagramComment[];
  commentActions: CommentActions;
}) {
  const children = record.document.nodes.filter(
    (item) => item.parentId === node.id,
  );
  const related = record.document.edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  const byId = new Map(record.document.nodes.map((item) => [item.id, item]));
  return (
    <aside className="inspector" aria-label="Node details">
      <div className="inspector-top">
        <span className="inspector-kind">
          <Layers3 size={14} />
          {kindLabels[node.kind]}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-scroll">
        <h2>{node.label}</h2>
        {node.description && (
          <p className="node-description">{node.description}</p>
        )}
        {editing && (
          <div className="inspector-actions">
            <button
              className="button small"
              onClick={onEdit}
              aria-label="Edit node"
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        )}
        {children.length > 0 && (
          <section className="inspector-section">
            <div className="section-row">
              <h3>
                Child steps<span>{children.length}</span>
              </h3>
              <button className="text-button" onClick={() => onDrill(node.id)}>
                Open in map
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
        {node.notes && (
          <section className="inspector-section">
            <h3>
              <FileText size={14} />
              Notes
            </h3>
            <div className="prose-note">{node.notes}</div>
          </section>
        )}
        {node.code?.length > 0 && (
          <CodeSection node={node} root={record.projectRoot ?? ""} />
        )}
        {node.sources.length > 0 && (
          <section className="inspector-section">
            <h3>
              Sources<span>{node.sources.length}</span>
            </h3>
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
          </section>
        )}
        {related.length > 0 && (
          <section className="inspector-section">
            <div className="section-row">
              <h3>
                Connections<span>{related.length}</span>
              </h3>
              <button
                className={`text-button ${focus ? "active" : ""}`}
                aria-pressed={focus}
                onClick={onFocus}
              >
                <Crosshair size={13} />
                {focus ? "Clear highlight" : "Highlight"}
              </button>
            </div>
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
                              ? "Feedback"
                              : edge.kind === "reference"
                                ? "Reference"
                                : outgoing
                                  ? "Next step"
                                  : "Previous step")}
                        </small>
                      </span>
                    </button>
                    {editing && (
                      <button
                        className="icon-button"
                        onClick={() => onEditEdge(edge)}
                        aria-label="Edit connection"
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
        <NodeComments
          nodeId={node.id}
          comments={comments}
          actions={commentActions}
        />
        {node.tags.length > 0 && (
          <div className="tag-list inspector-tags">
            {node.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
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
    <aside className="inspector" aria-label="Connection details">
      <div className="inspector-top">
        <span className="inspector-kind">
          <ArrowRight size={14} />
          Connection
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-scroll">
        <h2>Connections between steps</h2>
        <p className="node-description">
          Connections between the same phases are grouped in the overview.
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
            <p>{edge.label || "No connection label yet."}</p>
            <span className="tag-list">
              <span>
                {edge.kind === "feedback"
                  ? "Feedback"
                  : edge.kind === "reference"
                    ? "Reference"
                    : "Flow"}
              </span>
            </span>
            {editing && (
              <button
                className="button small edge-edit-button"
                onClick={() => onEdit(edge)}
              >
                <Pencil size={14} />
                Edit connection
              </button>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}
