"use client";
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "./dialog";
import { FormError } from "./editors";
import { api } from "@/lib/http/client";
import type { DiagramRecord, DiagramRevision } from "@/lib/diagrams/schema";

export function ConnectionsDialog({ onClose }: { onClose: () => void }) {
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    api<{ mcpUrl: string }>("/api/status")
      .then((status) => setEndpoint(status.mcpUrl))
      .catch((failure) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load the connection details.",
        ),
      );
  }, []);
  const clients = [
    {
      name: "Claude Code",
      command: `claude mcp add --transport http --scope user mefagram ${endpoint}`,
      help: "Run once in a terminal to use Mefagram from every project. Inside this repository, the bundled .mcp.json connects automatically.",
    },
    {
      name: "Codex",
      command: `codex mcp add mefagram --url ${endpoint}`,
      help: "Run once in a terminal. The Codex app, CLI and IDE extension share this setting in ~/.codex/config.toml.",
    },
  ];
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
      description="Agents on this computer can read and update this workspace using MCP tools."
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
            Streamable HTTP, no credentials. It works while the app runs on
            this computer.
          </p>
        </div>
        {clients.map((client) => (
          <div className="connection-endpoint" key={client.name}>
            <div className="section-row">
              <h3>{client.name}</h3>
              <button
                className="text-button"
                disabled={!endpoint}
                onClick={() => copy(client.command, client.name)}
              >
                {copied === client.name ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
                Copy
              </button>
            </div>
            <input
              readOnly
              aria-label={`${client.name} command`}
              value={endpoint ? client.command : ""}
            />
            <p className="field-help">{client.help}</p>
          </div>
        ))}
        <FormError error={error} />
        <p className="connection-privacy">
          <ShieldCheck size={16} />
          Only programs on this computer can connect. Requests from websites
          are refused.
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
