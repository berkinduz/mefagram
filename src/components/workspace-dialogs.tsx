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
              : "Could not load connections.",
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
      setError("Could not copy to the clipboard. Select the field to copy it manually.");
    }
  }
  return (
    <Dialog
      title="Agent connections"
      description="Your agents can read and update this workspace using MCP tools."
      onClose={onClose}
      wide
    >
      <div className="dialog-form">
        <div className="connection-endpoint">
          <div className="section-row">
            <h3>MCP endpoint</h3>
            <button
              className="text-button"
              onClick={() => copy(endpoint, "endpoint")}
            >
              {copied === "endpoint" ? <Check size={14} /> : <Copy size={14} />}
              Copy
            </button>
          </div>
          <input readOnly aria-label="MCP endpoint" value={endpoint} />
          <p className="field-help">
            {local
              ? "This address works on this computer. Cloud agents need the app to run on a reachable server."
              : "Connect to this endpoint from an OAuth-compatible agent. Authorize access with your account."}
          </p>
        </div>
        <div className="section-row connection-heading">
          <h3>Personal access tokens</h3>
          <button
            className="button small"
            onClick={() => {
              setCreating(!creating);
              setNewToken("");
            }}
          >
            <Plus size={14} />
            Create token
          </button>
        </div>
        <p className="field-help">
          For agents that support bearer tokens. Tokens only grant access to your diagrams.
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
                    : "Could not create the token.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-two">
              <label>
                Connection name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Permission
                <select
                  value={permission}
                  onChange={(event) => setPermission(event.target.value)}
                >
                  <option value="read">Read only</option>
                  <option value="write">Read and edit</option>
                </select>
              </label>
            </div>
            <div className="dialog-actions">
              <span className="field-help">Valid for 30 days.</span>
              <button className="button primary" disabled={busy}>
                Create access token
              </button>
            </div>
          </form>
        )}
        {newToken && (
          <div className="new-token">
            <strong>
              <KeyRound size={16} />
              Save your token now
            </strong>
            <p>This value will not be shown again.</p>
            <div className="copy-field">
              <input
                readOnly
                aria-label="New access token"
                value={newToken}
              />
              <button
                className="button small"
                onClick={() => copy(newToken, "token")}
              >
                {copied === "token" ? <Check size={15} /> : <Copy size={15} />}
                Copy
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
                    ? "Revoked"
                    : `${token.scopes.includes("diagrams:write") ? "Read and edit" : "Read only"} · Expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(token.expiresAt))}`}
                </span>
              </div>
              {!token.revoked && (
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={`Revoke ${token.name} token`}
                  title="Revoke access"
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
                          : "Could not revoke access.",
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
          Keep your token out of source code and diagram notes.
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
      title="Revision history"
      description="Every save creates a revision. Restoring an earlier revision preserves the existing history."
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
                      ? "Starter map"
                      : "You"}
                  <span className="history-separator" />
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.createdAt))}
                </small>
              </div>
              {item.revision === record.revision ? (
                <span className="current-revision">Current</span>
              ) : (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Restore revision ${item.revision}`}
                  title="Restore this revision"
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
                          : "Could not restore the revision.",
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
