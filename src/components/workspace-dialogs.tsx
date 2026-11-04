"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Dialog } from "./dialog";
import { FormError } from "./editors";
import { api } from "@/lib/http/client";
import type { DiagramRecord, DiagramRevision } from "@/lib/diagrams/schema";
import type { DiagramScope } from "@/lib/auth/tokens";

interface TokenSummary {
  id: string;
  name: string;
  scopes: DiagramScope[];
  expiresAt: string;
  revoked: boolean;
}

export function ConnectionsDialog({ onClose }: { onClose: () => void }) {
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [endpoint, setEndpoint] = useState("");
  const [local, setLocal] = useState(true);
  const [newToken, setNewToken] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Codex agent");
  const [permission, setPermission] = useState("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const load = useCallback(
    () =>
      Promise.all([
        api<TokenSummary[]>("/api/tokens"),
        api<{ mcpUrl: string; storage: string }>("/api/status"),
      ])
        .then(([rows, status]) => {
          setTokens(rows);
          setEndpoint(status.mcpUrl);
          setLocal(
            ["localhost", "127.0.0.1", "[::1]"].includes(
              new URL(status.mcpUrl).hostname,
            ),
          );
        })
        .catch((failure) =>
          setError(
            failure instanceof Error
              ? failure.message
              : "Bağlantılar açılamadı.",
          ),
        ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function copy(value: string, which: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
    } catch {
      setError("Panoya kopyalanamadı. Alanı seçerek kopyalayabilirsin.");
    }
  }
  return (
    <Dialog
      title="Agent bağlantıları"
      description="Codex ve Dot, bu çalışma alanını MCP araçlarıyla okuyup güncelleyebilir."
      onClose={onClose}
      wide
    >
      <div className="dialog-form">
        <div className="connection-endpoint">
          <div className="section-row">
            <h3>MCP adresi</h3>
            <button
              className="text-button"
              onClick={() => copy(endpoint, "endpoint")}
            >
              {copied === "endpoint" ? <Check size={14} /> : <Copy size={14} />}
              Kopyala
            </button>
          </div>
          <input readOnly aria-label="MCP adresi" value={endpoint} />
          <p className="field-help">
            {local
              ? "Bu adres bu bilgisayarda çalışır. Dot’un buluttan erişebilmesi için uygulamanın erişilebilir bir sunucuda çalışması gerekir."
              : "OAuth destekleyen agentında bu adresle bağlantı başlat. Erişim iznini kendi hesabınla ver."}
          </p>
        </div>
        <div className="section-row connection-heading">
          <h3>Kişisel erişim anahtarları</h3>
          <button
            className="button small"
            onClick={() => {
              setCreating(!creating);
              setNewToken("");
            }}
          >
            <Plus size={14} />
            Anahtar oluştur
          </button>
        </div>
        <p className="field-help">
          Bearer token destekleyen agentlar için. Anahtarlar yalnızca
          diyagramlarına erişir.
        </p>
        {creating && (
          <form
            className="token-form form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const issued = await api<{ token: string }>("/api/tokens", {
                  method: "POST",
                  body: {
                    name,
                    scopes:
                      permission === "write"
                        ? ["diagrams:read", "diagrams:write"]
                        : ["diagrams:read"],
                    expiresInDays: 30,
                  },
                });
                setNewToken(issued.token);
                setCreating(false);
                await load();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Anahtar oluşturulamadı.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-two">
              <label>
                Bağlantı adı
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                İzin
                <select
                  value={permission}
                  onChange={(event) => setPermission(event.target.value)}
                >
                  <option value="read">Yalnızca okuma</option>
                  <option value="write">Okuma ve düzenleme</option>
                </select>
              </label>
            </div>
            <div className="dialog-actions">
              <span className="field-help">30 gün geçerli.</span>
              <button className="button primary" disabled={busy}>
                Erişim anahtarını oluştur
              </button>
            </div>
          </form>
        )}
        {newToken && (
          <div className="new-token">
            <strong>
              <KeyRound size={16} />
              Anahtarını şimdi kaydet
            </strong>
            <p>Bu değer daha sonra yeniden gösterilmez.</p>
            <div className="copy-field">
              <input
                readOnly
                aria-label="Yeni erişim anahtarı"
                value={newToken}
              />
              <button
                className="button small"
                onClick={() => copy(newToken, "token")}
              >
                {copied === "token" ? <Check size={15} /> : <Copy size={15} />}
                Kopyala
              </button>
            </div>
          </div>
        )}
        <div className="token-list">
          {tokens.map((token) => (
            <div
              key={token.id}
              className={`token-row ${token.revoked ? "token-revoked" : ""}`}
            >
              <KeyRound size={16} />
              <div>
                <strong>{token.name}</strong>
                <span>
                  {token.revoked
                    ? "İptal edildi"
                    : `${token.scopes.includes("diagrams:write") ? "Okuma ve düzenleme" : "Yalnızca okuma"} · ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(token.expiresAt))} tarihine kadar`}
                </span>
              </div>
              {!token.revoked && (
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={`${token.name} anahtarını iptal et`}
                  title="Erişimi iptal et"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/api/tokens/${token.id}`, {
                        method: "DELETE",
                      });
                      await load();
                    } catch (failure) {
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : "Erişim iptal edilemedi.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
        <FormError error={error} />
        <p className="connection-privacy">
          <ShieldCheck size={16} />
          Anahtarını kaynak koduna veya diyagram notlarına ekleme.
        </p>
      </div>
    </Dialog>
  );
}

export function HistoryDialog({
  record,
  onClose,
  onRestore,
}: {
  record: DiagramRecord;
  onClose: () => void;
  onRestore: (revision: number) => Promise<void>;
}) {
  const [history, setHistory] = useState<DiagramRevision[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<DiagramRevision[]>(`/api/diagrams/${record.id}/history`)
      .then(setHistory)
      .catch((failure) => setError(failure.message));
  }, [record.id, record.revision]);
  return (
    <Dialog
      title="Sürüm geçmişi"
      description="Her kayıt bir sürüm oluşturur. Önceki bir sürümü geri yüklemek mevcut geçmişi korur."
      onClose={onClose}
    >
      <div className="dialog-form">
        <div className="history-list">
          {history.map((item) => (
            <div className="history-row" key={item.revision}>
              <span className="revision-number">{item.revision}</span>
              <div>
                <strong>{item.summary}</strong>
                <small>
                  {item.actor === "mcp"
                    ? "Agent"
                    : item.actor === "setup"
                      ? "Başlangıç haritası"
                      : "Sen"}
                  <span className="history-separator" />
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.createdAt))}
                </small>
              </div>
              {item.revision === record.revision ? (
                <span className="current-revision">Güncel</span>
              ) : (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Sürüm ${item.revision} geri yükle`}
                  title="Bu sürümü geri yükle"
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await onRestore(item.revision);
                      onClose();
                    } catch (failure) {
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : "Sürüm geri yüklenemedi.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
