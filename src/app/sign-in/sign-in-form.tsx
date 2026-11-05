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
            ? "Too many attempts. Please try again in a minute."
            : "Email or password is incorrect. Check your details.",
        );
        return;
      }
      window.location.assign(result.redirect && result.url ? result.url : "/");
    } catch {
      setError("Could not connect to the workspace. Please try again.");
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
        <h1>Welcome back to your maps.</h1>
        <p>
          See your ideas together.
          <br />
          Explore connections and find your next step.
        </p>
        <form onSubmit={submit} className="form-stack">
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="Your account email"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Your password"
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
            Open workspace
          </button>
        </form>
        <div className="sign-in-footnote">
          Your private workspace.
          <br />
          Sign in with the account created during setup.
        </div>
      </section>
      <footer className="sign-in-footer">
        From an idea to a map you can follow.
      </footer>
    </main>
  );
}
