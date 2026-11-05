"use client";
import { useState } from "react";
import { Check, PlugZap, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export function ConsentForm({
  clientName,
  query,
}: {
  clientName: string;
  query: string;
}) {
  const params = new URLSearchParams(query);
  const scopes = (params.get("scope") ?? "").split(" ");
  const [write, setWrite] = useState(scopes.includes("diagrams:write"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function consent(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accept,
          oauth_query: query,
          scope: scopes
            .filter((scope) => scope !== "diagrams:write" || write)
            .join(" "),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        setError(
          "This connection request is invalid or expired. Start a new request from your agent.",
        );
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("Could not complete the connection. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sign-in-page">
      <div className="sign-in-brand">
        <Brand />
      </div>
      <section className="sign-in-card consent-card">
        <div className="private-icon">
          <PlugZap size={23} />
        </div>
        <h1>Connect your agent.</h1>
        <p>
          <strong>{clientName}</strong> wants to access your Mefagram workspace.
        </p>
        <ul className="permission-list">
          <li>
            <Check size={17} />
            Find and read your diagrams
          </li>
          {scopes.includes("diagrams:write") && (
            <li>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={write}
                  onChange={(event) => setWrite(event.target.checked)}
                />
                Edit nodes, connections and notes
              </label>
            </li>
          )}
        </ul>
        <p className="consent-note">
          <ShieldCheck size={17} />
          The agent can only access diagrams available to your account.
        </p>
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => consent(false)}
          >
            Deny
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => consent(true)}
          >
            Allow connection
          </button>
        </div>
      </section>
    </main>
  );
}
