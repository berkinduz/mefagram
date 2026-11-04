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
          "Bağlantı isteği geçersiz veya süresi dolmuş. Agentından yeni bir bağlantı isteği başlat.",
        );
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("Bağlantı tamamlanamadı. Yeniden dene.");
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
        <h1>Agentını bağla.</h1>
        <p>
          <strong>{clientName}</strong>, Mefagram çalışma alanına erişmek
          istiyor.
        </p>
        <ul className="permission-list">
          <li>
            <Check size={17} />
            Diyagramlarını bulma ve okuma
          </li>
          {scopes.includes("diagrams:write") && (
            <li>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={write}
                  onChange={(event) => setWrite(event.target.checked)}
                />
                Düğüm, bağlantı ve notları düzenleme
              </label>
            </li>
          )}
        </ul>
        <p className="consent-note">
          <ShieldCheck size={17} />
          Agent yalnızca hesabının erişebildiği diyagramları kullanabilir.
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
            İzin verme
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => consent(true)}
          >
            Bağlantıya izin ver
          </button>
        </div>
      </section>
    </main>
  );
}
