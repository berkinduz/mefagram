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
  return (
    <aside className="collection" aria-label="Çalışma alanı">
      <div className="collection-brand">
        <Brand />
      </div>
      <div className="workspace-owner">
        <span className="owner-avatar">
          {userName.slice(0, 1).toLocaleUpperCase("tr-TR")}
        </span>
        <div>
          <strong>Kişisel alanım</strong>
          <span>{userName}</span>
        </div>
        <ChevronDown size={14} />
      </div>
      <div className="collection-search">
        <Search size={15} />
        <input
          aria-label="Diyagramlarda ara"
          placeholder="Diyagramlarda ara"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Aramayı temizle"
            onClick={() => onQuery("")}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <button className="button primary new-diagram" onClick={onNew}>
        <Plus size={16} />
        Yeni diyagram
      </button>
      <div className="collection-tabs">
        <button
          className={!archived ? "active" : ""}
          onClick={() => onArchive(false)}
        >
          <FolderOpen size={15} />
          Diyagramlar{!archived && <span>{diagrams.length}</span>}
        </button>
        <button
          className={archived ? "active" : ""}
          aria-label="Arşivi aç"
          title="Arşiv"
          onClick={() => onArchive(!archived)}
        >
          <Archive size={15} />
        </button>
      </div>
      <nav
        className="diagram-list"
        aria-label="Diyagram koleksiyonu"
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
                {diagram.nodeCount} düğüm
                <span className="list-item-divider" />
                {diagram.tags[0] ?? "Çalışma haritası"}
              </span>
            </span>
          </button>
        ))}
        {!diagrams.length && !loading && (
          <div className="collection-empty">
            <FolderOpen size={23} />
            <p>
              {query
                ? "Bu aramayla eşleşen diyagram yok."
                : archived
                  ? "Arşivde diyagram yok."
                  : "İlk diyagramına yer aç."}
            </p>
            {query && (
              <button className="text-button" onClick={() => onQuery("")}>
                Aramayı temizle
              </button>
            )}
          </div>
        )}
      </nav>
      <div className="collection-footer">
        <button onClick={onImport}>
          <Import size={16} />
          Diyagramı içe aktar
        </button>
        <button onClick={onConnect}>
          <PlugZap size={16} />
          Agent bağlantıları
        </button>
        <button
          onClick={async () => {
            await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            });
            router.replace("/sign-in");
            router.refresh();
          }}
        >
          <LogOut size={16} />
          Oturumu kapat
        </button>
      </div>
    </aside>
  );
}
