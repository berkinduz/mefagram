"use client";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";

export function SignInForm() {
  const search = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          ...(search.has("client_id")
            ? { oauth_query: search.toString() }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Çok fazla deneme yapıldı. Bir dakika sonra yeniden dene."
            : "E-posta veya parola doğru değil. Bilgilerini kontrol et.",
        );
        return;
      }
      window.location.assign(result.redirect && result.url ? result.url : "/");
    } catch {
      setError("Çalışma alanına bağlanılamadı. Yeniden dene.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sign-in-page">
      <div className="sign-in-brand">
        <Brand />
      </div>
      <section className="sign-in-card">
        <div className="private-icon">
          <LockKeyhole size={21} />
        </div>
        <h1>Haritalarına dön.</h1>
        <p>
          Fikirlerini bir arada gör.
          <br />
          Bağlantıları keşfet, bir sonraki adımı netleştir.
        </p>
        <form onSubmit={submit} className="form-stack">
          <label>
            E-posta
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="Hesabının e-posta adresi"
            />
          </label>
          <label>
            Parola
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Parolan"
            />
          </label>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
            Çalışma alanını aç
          </button>
        </form>
        <div className="sign-in-footnote">
          Yalnızca sana açık bir çalışma alanı.
          <br />
          Kurulumda oluşturulan hesabınla giriş yap.
        </div>
      </section>
      <footer className="sign-in-footer">
        Bir fikirden, anlaşılır bir haritaya.
      </footer>
    </main>
  );
}
