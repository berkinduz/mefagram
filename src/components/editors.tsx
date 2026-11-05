"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog } from "./dialog";
import { ApiError } from "@/lib/http/client";
import { MAX_TRANSFER_BYTES } from "@/lib/diagrams/limits";
import type {
  DiagramRecord,
  DiagramNode,
  DiagramEdge,
  DiagramContent,
} from "@/lib/diagrams/schema";
import type { DiagramOperation } from "@/lib/diagrams/patch";
import { breadcrumbsFor } from "@/lib/graph/projection";

const tagsFrom = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  ),
];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not complete the request.";
const uncertainResult = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500);
// An identical retry keeps its key; a genuinely changed request gets a new one.
function useMutationKey() {
  const [keys] = useState(() => new Map<string, string>());
  return (payload: unknown) => {
    const signature = JSON.stringify(payload);
    if (!keys.has(signature)) keys.set(signature, crypto.randomUUID());
    return keys.get(signature)!;
  };
}
export function FormError({ error }: { error: string }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null;
}

export function DiagramEditor({
  record,
  onClose,
  onCreate,
  onUpdate,
}: {
  record?: DiagramRecord;
  onClose: () => void;
  onCreate?: (content: DiagramContent, mutationId: string) => Promise<void>;
  onUpdate?: (
    operations: DiagramOperation[],
    mutationId: string,
  ) => Promise<void>;
}) {
  const [baseline] = useState(record);
  const [title, setTitle] = useState(record?.title ?? "");
  const [description, setDescription] = useState(record?.description ?? "");
  const [tags, setTags] = useState(record?.tags.join(", ") ?? "");
  const mutationKey = useMutationKey();
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = { title: title.trim(), description, tags: tagsFrom(tags) };
      if (baseline && onUpdate) {
        const changes = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) =>
              JSON.stringify(value) !==
              JSON.stringify(baseline[key as keyof typeof values]),
          ),
        );
        if (Object.keys(changes).length)
          await onUpdate(
            [{ op: "update_metadata", changes }],
            mutationKey(changes),
          );
      } else if (onCreate)
        await onCreate(
          { ...values, document: { schemaVersion: 1, nodes: [], edges: [] } },
          mutationKey(values),
        );
      onClose();
    } catch (failure) {
      const pending = !baseline && uncertainResult(failure);
      setUncertain(pending);
      setError(
        pending
          ? "The creation result could not be confirmed. Try again to confirm the same save; your entries are preserved."
          : message(failure),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={record ? "Diagram details" : "Create a diagram"}
      description={
        record
          ? "Edit the name, description and searchable tags."
          : "Give it a name. You or your agent can build the map step by step."
      }
      onClose={onClose}
    >
      <form className="dialog-form form-stack" onSubmit={submit}>
        <label>
          Diagram name
          <input
            readOnly={uncertain}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            autoFocus
            placeholder="For example: Product development"
          />
        </label>
        <label>
          Description
          <textarea
            readOnly={uncertain}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={12000}
            placeholder="What does this map help you understand?"
          />
        </label>
        <label>
          Tags
          <input
            readOnly={uncertain}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Product, research, release"
          />
          <small>Separate tags with commas.</small>
        </label>
        <FormError error={error} />
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !title.trim()}>
            {busy
              ? "Saving…"
              : record
                ? "Save changes"
                : "Create diagram"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function NodeEditor({
  record,
  node,
  parentId,
  onClose,
  onSave,
}: {
  record: DiagramRecord;
  node?: DiagramNode;
  parentId: string | null;
  onClose: () => void;
  onSave: (operations: DiagramOperation[], mutationId: string) => Promise<void>;
}) {
  const [baseline] = useState(node);
  const [id] = useState(node?.id ?? `node-${crypto.randomUUID()}`);
  const [label, setLabel] = useState(node?.label ?? "");
  const [kind, setKind] = useState<DiagramNode["kind"]>(node?.kind ?? "step");
  const [description, setDescription] = useState(node?.description ?? "");
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [parent, setParent] = useState(node?.parentId ?? parentId ?? "");
  const [tags, setTags] = useState(node?.tags.join(", ") ?? "");
  const [sources, setSources] = useState(node?.sources ?? []);
  const mutationKey = useMutationKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const parentOptions = record.document.nodes.filter(
    (candidate) =>
      candidate.id !== id &&
      !breadcrumbsFor(record.document, candidate.id).some(
        (item) => item.id === id,
      ),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = {
        label: label.trim(),
        kind,
        description,
        notes,
        parentId: parent || null,
        tags: tagsFrom(tags),
        sources: sources.map((source) => ({
          label: source.label.trim(),
          url: source.url.trim(),
        })),
      };
      if (baseline) {
        const changes = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) =>
              JSON.stringify(value) !==
              JSON.stringify(
                key === "parentId"
                  ? (baseline.parentId ?? null)
                  : baseline[key as keyof typeof values],
              ),
          ),
        );
        if (Object.keys(changes).length)
          await onSave(
            [{ op: "update_node", id, changes }],
            mutationKey(changes),
          );
      } else
        await onSave(
          [{ op: "add_node", node: { id, ...values } }],
          mutationKey(values),
        );
      onClose();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(
        [{ op: "remove_node", id, cascade: true }],
        mutationKey({ remove: id }),
      );
      onClose();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={node ? "Edit node" : "Add a node to the map"}
      description="Use a short name. Keep descriptions and notes in the details."
      onClose={onClose}
      wide
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="editor-grid">
          <div className="form-stack">
            <label>
              Node name
              <input
                autoFocus
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                required
                maxLength={120}
                placeholder="Name this step"
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={12000}
                placeholder="What are we doing, and why?"
              />
            </label>
            <label>
              Notes
              <textarea
                rows={5}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={50000}
                placeholder="Decisions, open questions, research notes…"
              />
            </label>
          </div>
          <div className="form-stack editor-settings">
            <label>
              Node type
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as DiagramNode["kind"])
                }
              >
                <option value="phase">Phase</option>
                <option value="step">Step</option>
                <option value="decision">Decision</option>
                <option value="note">Note</option>
                <option value="result">Result</option>
              </select>
            </label>
            <label>
              Parent node
              <select
                value={parent}
                onChange={(event) => setParent(event.target.value)}
              >
                <option value="">Overview</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tags
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Separate with commas"
              />
            </label>
            <p className="field-help">
              Parent nodes divide large maps into smaller processes you can open.
            </p>
          </div>
        </div>
        <section className="sources-editor">
          <div className="section-row">
            <h3>Sources</h3>
            <button
              type="button"
              className="text-button"
              onClick={() => setSources([...sources, { label: "", url: "" }])}
              disabled={sources.length >= 30}
            >
              <Plus size={15} />
              Add source
            </button>
          </div>
          {sources.map((source, index) => (
            <div className="source-input-row" key={index}>
              <label className="sr-only" htmlFor={`source-label-${index}`}>
                Source {index + 1} name
              </label>
              <input
                id={`source-label-${index}`}
                placeholder="Source name"
                value={source.label}
                required
                maxLength={160}
                onChange={(event) =>
                  setSources(
                    sources.map((value, position) =>
                      position === index
                        ? { ...value, label: event.target.value }
                        : value,
                    ),
                  )
                }
              />
              <label className="sr-only" htmlFor={`source-url-${index}`}>
                Source {index + 1} URL
              </label>
              <input
                id={`source-url-${index}`}
                type="url"
                placeholder="https://"
                value={source.url}
                required
                maxLength={2048}
                onChange={(event) =>
                  setSources(
                    sources.map((value, position) =>
                      position === index
                        ? { ...value, url: event.target.value }
                        : value,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove source ${index + 1}`}
                onClick={() =>
                  setSources(
                    sources.filter((_, position) => position !== index),
                  )
                }
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </section>
        <FormError error={error} />
        {error && (
          <a
            className="text-link"
            href="/sign-in"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign in in a new tab if needed
          </a>
        )}
        {confirmDelete && (
          <p className="form-error">
            Child steps and connections will also be removed. You can restore them from revision history.
          </p>
        )}
        <div className="dialog-actions">
          {node && (
            <button
              type="button"
              className="text-button danger push-left"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 size={15} />
              {confirmDelete
                ? "Remove node and connections"
                : "Remove node"}
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !label.trim()}>
            {busy ? "Saving…" : "Save node"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function EdgeEditor({
  record,
  edge,
  source,
  target,
  onClose,
  onSave,
}: {
  record: DiagramRecord;
  edge?: DiagramEdge;
  source?: string;
  target?: string;
  onClose: () => void;
  onSave: (operations: DiagramOperation[], mutationId: string) => Promise<void>;
}) {
  const [baseline] = useState(edge);
  const [id] = useState(edge?.id ?? `edge-${crypto.randomUUID()}`);
  const [from, setFrom] = useState(
    edge?.source ?? source ?? record.document.nodes[0]?.id ?? "",
  );
  const [to, setTo] = useState(
    edge?.target ?? target ?? record.document.nodes[1]?.id ?? "",
  );
  const [label, setLabel] = useState(edge?.label ?? "");
  const [kind, setKind] = useState<DiagramEdge["kind"]>(edge?.kind ?? "flow");
  const mutationKey = useMutationKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = { source: from, target: to, label, kind };
      if (baseline) {
        const changes = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => value !== baseline[key as keyof typeof values],
          ),
        );
        if (Object.keys(changes).length)
          await onSave(
            [{ op: "update_edge", id, changes }],
            mutationKey(changes),
          );
      } else
        await onSave(
          [{ op: "add_edge", edge: { id, ...values } }],
          mutationKey(values),
        );
      onClose();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={edge ? "Edit connection" : "Connect two nodes"}
      onClose={onClose}
    >
      <form className="dialog-form form-stack" onSubmit={submit}>
        <div className="form-two">
          <label>
            Source
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
            >
              <option value="">Select a node</option>
              {record.document.nodes.map((node) => (
                <option value={node.id} key={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
            >
              <option value="">Select a node</option>
              {record.document.nodes.map((node) => (
                <option value={node.id} key={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Connection name
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={160}
            placeholder="Optional: when or why?"
          />
        </label>
        <label>
          Connection type
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as DiagramEdge["kind"])
            }
          >
            <option value="flow">Flow</option>
            <option value="feedback">Feedback</option>
            <option value="reference">Reference</option>
          </select>
        </label>
        <FormError error={error} />
        <div className="dialog-actions">
          {edge && (
            <button
              type="button"
              className="text-button danger push-left"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(
                    [{ op: "remove_edge", id: edge.id }],
                    mutationKey({ remove: edge.id }),
                  );
                  onClose();
                } catch (failure) {
                  setError(message(failure));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} />
              Remove connection
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !from || !to}>
            {busy ? "Saving…" : "Save connection"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (value: unknown, mutationId: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mutationKey = useMutationKey();
  const [uncertain, setUncertain] = useState(false);
  return (
    <Dialog
      title="Import diagram"
      description="Mefagram JSON files include nodes, connections, notes and sources."
      onClose={onClose}
    >
      <form
        className="dialog-form form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            if (file.size > MAX_TRANSFER_BYTES)
              throw new ApiError(
                "The file exceeds the 8 MB transfer limit. Diagram content must be 2 MB or less.",
                "VALIDATION_ERROR",
                400,
              );
            let value;
            try {
              value = JSON.parse(await file.text());
            } catch {
              throw new Error("The file does not contain valid JSON.");
            }
            await onImport(value, mutationKey(value));
            onClose();
          } catch (failure) {
            const pending = uncertainResult(failure);
            setUncertain(pending);
            setError(
              pending
                ? "The import result could not be confirmed. Try again with the same file."
                : message(failure),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="file-field">
          JSON file
          <input
            disabled={uncertain}
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError("");
            }}
          />
          <small>
            The imported diagram is saved as a new record.
          </small>
        </label>
        <FormError error={error} />
        <div className="dialog-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!file || busy}>
            {busy ? "Importing…" : "Import diagram"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
