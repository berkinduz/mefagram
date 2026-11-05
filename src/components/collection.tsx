"use client";
import {
  Archive,
  ChevronDown,
  FolderOpen,
  Import,
  LogOut,
  Network,
  Plus,
  PlugZap,
  Search,
  X,
} from "lucide-react";
import type { DiagramSummary } from "@/lib/diagrams/schema";
import { Brand } from "./brand";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Collection({
  diagrams,
  activeId,
  query,
  onQuery,
  archived,
  onArchive,
  loading,
  onOpen,
  onNew,
  onImport,
  onConnect,
  userName,
}: {
  diagrams: DiagramSummary[];
  activeId?: string;
  query: string;
  onQuery: (value: string) => void;
  archived: boolean;
  onArchive: (value: boolean) => void;
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onConnect: () => void;
  userName: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  return (
    <aside className="collection" aria-label="Workspace">
      <div className="collection-brand">
        <Brand />
      </div>
      <div className="workspace-owner">
        <span className="owner-avatar">
          {userName.slice(0, 1).toLocaleUpperCase("en")}
        </span>
        <div>
          <strong>My workspace</strong>
          <span>{userName}</span>
        </div>
        <ChevronDown size={14} />
      </div>
      <div className="collection-search">
        <Search size={15} />
        <input
          aria-label="Search diagrams"
          placeholder="Search diagrams"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => onQuery("")}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <button className="button primary new-diagram" onClick={onNew}>
        <Plus size={16} />
        New diagram
      </button>
      <div className="collection-tabs">
        <button
          className={!archived ? "active" : ""}
          onClick={() => onArchive(false)}
        >
          <FolderOpen size={15} />
          Diagrams{!archived && <span>{diagrams.length}</span>}
        </button>
        <button
          className={archived ? "active" : ""}
          aria-label="Open archive"
          title="Archive"
          onClick={() => onArchive(!archived)}
        >
          <Archive size={15} />
        </button>
      </div>
      <nav
        className="diagram-list"
        aria-label="Diagram collection"
        aria-busy={loading}
      >
        {diagrams.map((diagram) => (
          <button
            key={diagram.id}
            className={`diagram-list-item ${activeId === diagram.id ? "active" : ""}`}
            onClick={() => onOpen(diagram.id)}
          >
            <span className="diagram-thumbnail">
              <Network size={20} />
            </span>
            <span className="diagram-list-text">
              <strong>{diagram.title}</strong>
              <span>
                {diagram.nodeCount} {diagram.nodeCount === 1 ? "node" : "nodes"}
                <span className="list-item-divider" />
                {diagram.tags[0] ?? "Workflow map"}
              </span>
            </span>
          </button>
        ))}
        {!diagrams.length && !loading && (
          <div className="collection-empty">
            <FolderOpen size={23} />
            <p>
              {query
                ? "No diagrams match your search."
                : archived
                  ? "No archived diagrams."
                  : "Your first diagram starts here."}
            </p>
            {query && (
              <button className="text-button" onClick={() => onQuery("")}>
                Clear search
              </button>
            )}
          </div>
        )}
      </nav>
      <div className="collection-footer">
        {signOutError && (
          <p className="form-error" role="alert">
            {signOutError}
          </p>
        )}
        <button onClick={onImport}>
          <Import size={16} />
          Import diagram
        </button>
        <button onClick={onConnect}>
          <PlugZap size={16} />
          Agent connections
        </button>
        <button
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            setSignOutError("");
            try {
              const response = await fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
              });
              if (!response.ok) throw new Error("Sign-out was rejected.");
              router.replace("/sign-in");
              router.refresh();
            } catch {
              setSignOutError(
                "Could not sign out. You are still signed in; please try again.",
              );
              setSigningOut(false);
            }
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
