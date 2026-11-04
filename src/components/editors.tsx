"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Dialog } from "./dialog";
import { ApiError } from "@/lib/http/client";
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
  error instanceof Error ? error.message : "İşlem tamamlanamadı.";
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
          ? "Oluşturma isteğinin sonucu alınamadı. Aynı kaydı onaylamak için yeniden dene; bu sırada alanları koruduk."
          : message(failure),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={record ? "Diyagram bilgileri" : "Yeni bir diyagram"}
      description={
        record
          ? "Adını, açıklamasını ve aramada kullanılacak etiketlerini düzenle."
          : "Bir ad ver. Haritanı sen veya agentın adım adım oluşturabilirsiniz."
      }
      onClose={onClose}
    >
      <form className="dialog-form form-stack" onSubmit={submit}>
        <label>
          Diyagram adı
          <input
            readOnly={uncertain}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            autoFocus
            placeholder="Örneğin: Mefa Apps çalışma haritası"
          />
        </label>
        <label>
          Açıklama
          <textarea
            readOnly={uncertain}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={12000}
            placeholder="Bu harita neyi anlamaya yardımcı oluyor?"
          />
        </label>
        <label>
          Etiketler
          <input
            readOnly={uncertain}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Ürün, araştırma, yayın"
          />
          <small>Etiketleri virgülle ayır.</small>
        </label>
        <FormError error={error} />
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Vazgeç
          </button>
          <button className="button primary" disabled={busy || !title.trim()}>
            {busy
              ? "Kaydediliyor…"
              : record
                ? "Değişiklikleri kaydet"
                : "Diyagramı oluştur"}
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
      title={node ? "Düğümü düzenle" : "Haritaya bir düğüm ekle"}
      description="Kısa bir ad kullan; açıklama ve notları detaylarda tut."
      onClose={onClose}
      wide
    >
      <form className="dialog-form" onSubmit={submit}>
        <div className="editor-grid">
          <div className="form-stack">
            <label>
              Düğüm adı
              <input
                autoFocus
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                required
                maxLength={120}
                placeholder="Bu adımın adı"
              />
            </label>
            <label>
              Açıklama
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={12000}
                placeholder="Neyi, neden yapıyoruz?"
              />
            </label>
            <label>
              Notlar
              <textarea
                rows={5}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={50000}
                placeholder="Kararlar, açık sorular, araştırma notları…"
              />
            </label>
          </div>
          <div className="form-stack editor-settings">
            <label>
              Düğüm türü
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as DiagramNode["kind"])
                }
              >
                <option value="phase">Aşama</option>
                <option value="step">Adım</option>
                <option value="decision">Karar</option>
                <option value="note">Not</option>
                <option value="result">Çıktı</option>
              </select>
            </label>
            <label>
              Üst düğüm
              <select
                value={parent}
                onChange={(event) => setParent(event.target.value)}
              >
                <option value="">Genel harita</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Etiketler
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Virgülle ayır"
              />
            </label>
            <p className="field-help">
              Üst düğümler, büyük haritaları açılabilir küçük süreçlere ayırır.
            </p>
          </div>
        </div>
        <section className="sources-editor">
          <div className="section-row">
            <h3>Kaynaklar</h3>
            <button
              type="button"
              className="text-button"
              onClick={() => setSources([...sources, { label: "", url: "" }])}
              disabled={sources.length >= 30}
            >
              <Plus size={15} />
              Kaynak ekle
            </button>
          </div>
          {sources.map((source, index) => (
            <div className="source-input-row" key={index}>
              <label className="sr-only" htmlFor={`source-label-${index}`}>
                Kaynak {index + 1} adı
              </label>
              <input
                id={`source-label-${index}`}
                placeholder="Kaynak adı"
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
                Kaynak {index + 1} bağlantısı
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
                aria-label={`Kaynak ${index + 1} kaldır`}
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
            Gerekirse yeni sekmede oturum aç
          </a>
        )}
        {confirmDelete && (
          <p className="form-error">
            Alt adımlar ve bağlantılar da kaldırılacak. Sürüm geçmişinden geri
            alabilirsin.
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
                ? "Düğümü ve bağlantılarını kaldır"
                : "Düğümü kaldır"}
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Vazgeç
          </button>
          <button className="button primary" disabled={busy || !label.trim()}>
            {busy ? "Kaydediliyor…" : "Düğümü kaydet"}
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
      title={edge ? "Bağlantıyı düzenle" : "İki düğümü bağla"}
      onClose={onClose}
    >
      <form className="dialog-form form-stack" onSubmit={submit}>
        <div className="form-two">
          <label>
            Başlangıç
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
            >
              <option value="">Düğüm seç</option>
              {record.document.nodes.map((node) => (
                <option value={node.id} key={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hedef
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
            >
              <option value="">Düğüm seç</option>
              {record.document.nodes.map((node) => (
                <option value={node.id} key={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Bağlantı adı
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={160}
            placeholder="İsteğe bağlı: ne zaman, neden?"
          />
        </label>
        <label>
          Bağlantı türü
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as DiagramEdge["kind"])
            }
          >
            <option value="flow">Akış</option>
            <option value="feedback">Geri besleme</option>
            <option value="reference">İlişki / referans</option>
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
              Bağlantıyı kaldır
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Vazgeç
          </button>
          <button className="button primary" disabled={busy || !from || !to}>
            {busy ? "Kaydediliyor…" : "Bağlantıyı kaydet"}
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
      title="Diyagramı içe aktar"
      description="Mefagram JSON dosyaları; düğümleri, bağlantıları, notları ve kaynakları birlikte taşır."
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
            if (file.size > 2_000_000)
              throw new ApiError(
                "Dosya 2 MB sınırını aşıyor.",
                "VALIDATION_ERROR",
                400,
              );
            let value;
            try {
              value = JSON.parse(await file.text());
            } catch {
              throw new Error("Dosya geçerli JSON içermiyor.");
            }
            await onImport(value, mutationKey(value));
            onClose();
          } catch (failure) {
            const pending = uncertainResult(failure);
            setUncertain(pending);
            setError(
              pending
                ? "İçe aktarma sonucu alınamadı. Aynı dosyayla yeniden dene."
                : message(failure),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="file-field">
          JSON dosyası
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
            İçe aktarılan diyagram yeni bir kayıt olarak oluşturulur.
          </small>
        </label>
        <FormError error={error} />
        <div className="dialog-actions">
          <button className="button" type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button className="button primary" disabled={!file || busy}>
            {busy ? "İçe aktarılıyor…" : "Diyagramı içe aktar"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
