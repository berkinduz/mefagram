"use client";
import {
  Archive,
  FolderOpen,
  Import,
  Network,
  Plus,
  PlugZap,
  Search,
  X,
} from "lucide-react";
import type { DiagramSummary } from "@/lib/diagrams/schema";
import { useState } from "react";
import { Brand } from "./brand";

const ALL = "__all__";

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
}) {
  const [project, setProject] = useState(ALL);
  const projects = [
    ...new Set(diagrams.map((diagram) => diagram.project).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "en"));
  const activeProject = projects.includes(project) ? project : ALL;
  const shown =
    activeProject === ALL
      ? diagrams
      : diagrams.filter((diagram) => diagram.project === activeProject);
  return (
    <aside className="collection" aria-label="Workspace">
      <div className="collection-brand">
        <Brand />
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
          Diagrams{!archived && <span>{shown.length}</span>}
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
      {projects.length > 0 && (
        <select
          className="project-filter"
          aria-label="Project"
          value={activeProject}
          onChange={(event) => setProject(event.target.value)}
        >
          <option value={ALL}>All projects</option>
          {projects.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
      <nav
        className="diagram-list"
        aria-label="Diagram collection"
        aria-busy={loading}
      >
        {shown.map((diagram) => (
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
                {diagram.project || diagram.tags[0] || "Diagram"}
              </span>
            </span>
          </button>
        ))}
        {!shown.length && !loading && (
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
        <button onClick={onImport}>
          <Import size={16} />
          Import diagram
        </button>
        <button onClick={onConnect}>
          <PlugZap size={16} />
          Agent connections
        </button>
      </div>
    </aside>
  );
}
