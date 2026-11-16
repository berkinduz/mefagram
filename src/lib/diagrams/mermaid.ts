import { DiagramError } from "./errors";
import type {
  DiagramContent,
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
} from "./schema";

// Mermaid flowcharts are the lingua franca agents already write fluently.
// Mefagram reads a practical subset (nodes, shapes, subgraphs, links and link
// labels) and writes the same subset back, so a diagram can move between a
// chat, a pull request and the workspace without retyping it.

type Kind = DiagramNode["kind"];
type EdgeKind = DiagramEdge["kind"];

const RESERVED = /^(end|graph|subgraph|flowchart|style|class|classdef|click|linkstyle|direction)$/i;

function sanitizeId(raw: string, used: Map<string, string>) {
  const existing = used.get(raw);
  if (existing) return existing;
  let id = raw.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^[^a-zA-Z0-9]+/, "");
  if (!id) id = "node";
  id = id.slice(0, 80);
  const taken = new Set(used.values());
  let candidate = id;
  for (let index = 2; taken.has(candidate); index++)
    candidate = `${id.slice(0, 75)}-${index}`;
  used.set(raw, candidate);
  return candidate;
}

const SHAPES: { open: string; close: string; kind: Kind }[] = [
  { open: "([", close: "])", kind: "result" },
  { open: "[[", close: "]]", kind: "step" },
  { open: "[(", close: ")]", kind: "step" },
  { open: "((", close: "))", kind: "result" },
  { open: "{{", close: "}}", kind: "decision" },
  { open: "[/", close: "/]", kind: "step" },
  { open: "[\\", close: "\\]", kind: "step" },
  { open: "[", close: "]", kind: "step" },
  { open: "(", close: ")", kind: "step" },
  { open: "{", close: "}", kind: "decision" },
  { open: ">", close: "]", kind: "note" },
];

const LINKS: { pattern: RegExp; kind: EdgeKind }[] = [
  { pattern: /^-\.\s*([^.|]+?)\s*\.->/, kind: "feedback" },
  { pattern: /^==\s*([^=|]+?)\s*==>/, kind: "flow" },
  { pattern: /^--\s*([^-|>][^|]*?)\s*-->/, kind: "flow" },
  { pattern: /^<?-\.+->/, kind: "feedback" },
  { pattern: /^-\.+-/, kind: "feedback" },
  { pattern: /^<?=+>/, kind: "flow" },
  { pattern: /^<?-{2,}[>xo]/, kind: "flow" },
  { pattern: /^={3,}/, kind: "reference" },
  { pattern: /^-{3,}/, kind: "reference" },
  { pattern: /^~{3,}/, kind: "reference" },
];

function cleanLabel(value: string) {
  let label = value.trim();
  if (label.startsWith('"') && label.endsWith('"') && label.length > 1)
    label = label.slice(1, -1);
  label = label
    .replace(/#quot;/g, '"')
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label;
}

interface NodeRef {
  raw: string;
  label?: string;
  kind?: Kind;
}

class Scanner {
  position = 0;
  constructor(private readonly text: string) {}
  get rest() {
    return this.text.slice(this.position);
  }
  skipSpace() {
    while (/\s/.test(this.text[this.position] ?? "")) this.position++;
  }
  done() {
    this.skipSpace();
    return this.position >= this.text.length;
  }
  node(): NodeRef | null {
    this.skipSpace();
    const match = /^[A-Za-z0-9_][\w.-]*/.exec(this.rest);
    if (!match) return null;
    // A dash run directly after an ID begins a link (`a-->b`), not the ID.
    let raw = match[0];
    const link = /-{2,}|-\./.exec(raw);
    if (link) raw = raw.slice(0, link.index);
    raw = raw.replace(/[-.]+$/, "");
    if (!raw) return null;
    this.position += raw.length;
    for (const shape of SHAPES) {
      if (!this.rest.startsWith(shape.open)) continue;
      const start = this.position + shape.open.length;
      let end: number;
      if (this.text[start] === '"') {
        const quote = this.text.indexOf('"', start + 1);
        end = quote < 0 ? -1 : this.text.indexOf(shape.close, quote + 1);
      } else end = this.text.indexOf(shape.close, start);
      if (end < 0) break;
      const label = cleanLabel(this.text.slice(start, end));
      this.position = end + shape.close.length;
      return { raw, label, kind: shape.kind };
    }
    return { raw };
  }
  group(): NodeRef[] | null {
    const first = this.node();
    if (!first) return null;
    const nodes = [first];
    for (;;) {
      this.skipSpace();
      if (!this.rest.startsWith("&")) return nodes;
      this.position++;
      const next = this.node();
      if (!next) return nodes;
      nodes.push(next);
    }
  }
  link(): { kind: EdgeKind; label: string } | null {
    this.skipSpace();
    for (const { pattern, kind } of LINKS) {
      const match = pattern.exec(this.rest);
      if (!match) continue;
      this.position += match[0].length;
      let label = match[1] ? cleanLabel(match[1]) : "";
      this.skipSpace();
      const piped = /^\|([^|]*)\|/.exec(this.rest);
      if (piped) {
        label = cleanLabel(piped[1]);
        this.position += piped[0].length;
      }
      return { kind, label };
    }
    return null;
  }
}

function statements(source: string) {
  const result: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const withoutComment = line.replace(/%%.*$/, "");
    for (const part of withoutComment.split(";")) {
      const trimmed = part.trim();
      if (trimmed) result.push(trimmed);
    }
  }
  return result;
}

export function parseMermaid(source: string): DiagramDocument {
  const lines = statements(mermaidTitle(source).body);
  const header = lines.shift() ?? "";
  if (!/^(flowchart|graph)\b/i.test(header))
    throw new DiagramError(
      "VALIDATION_ERROR",
      "Only Mermaid flowcharts are supported. Start with `flowchart LR` or `graph TD`.",
    );
  const ids = new Map<string, string>();
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const edgeIds = new Set<string>();
  const parents: string[] = [];
  const ensure = (ref: NodeRef) => {
    const id = sanitizeId(ref.raw, ids);
    const existing = nodes.get(id);
    if (existing) {
      if (ref.label) existing.label = ref.label.slice(0, 120) || existing.label;
      if (ref.kind && existing.kind !== "phase") existing.kind = ref.kind;
      return id;
    }
    nodes.set(id, {
      id,
      label: (ref.label || ref.raw).slice(0, 120),
      kind: ref.kind ?? "step",
      description: "",
      notes: "",
      sources: [],
      tags: [],
      code: [],
      parentId: parents.at(-1) ?? null,
    });
    return id;
  };
  for (const statement of lines) {
    if (
      /^(classDef|class|style|click|linkStyle|direction|accTitle|accDescr)\b/i.test(
        statement,
      )
    )
      continue;
    if (/^end$/i.test(statement)) {
      parents.pop();
      continue;
    }
    const subgraph = /^subgraph\s+(.+)$/i.exec(statement);
    if (subgraph) {
      const scanner = new Scanner(subgraph[1].trim());
      const ref = scanner.node();
      const title = ref
        ? ref
        : { raw: subgraph[1].trim(), label: cleanLabel(subgraph[1]) };
      const label =
        ref && !ref.label && !scanner.done()
          ? cleanLabel(subgraph[1])
          : title.label;
      const id = ensure({ raw: title.raw, label });
      nodes.get(id)!.kind = "phase";
      parents.push(id);
      continue;
    }
    const scanner = new Scanner(statement);
    let sources = scanner.group();
    if (!sources) continue;
    let sourceIds = sources.map(ensure);
    for (;;) {
      const link = scanner.link();
      if (!link) break;
      const targets = scanner.group();
      if (!targets) break;
      const targetIds = targets.map(ensure);
      for (const source of sourceIds)
        for (const target of targetIds) {
          let id = `${source}-to-${target}`.slice(0, 76);
          for (let index = 2; edgeIds.has(id); index++)
            id = `${`${source}-to-${target}`.slice(0, 72)}-${index}`;
          edgeIds.add(id);
          edges.push({
            id,
            source,
            target,
            label: link.label.slice(0, 160),
            kind: link.kind,
          });
        }
      sources = targets;
      sourceIds = targetIds;
    }
  }
  return { schemaVersion: 1, nodes: [...nodes.values()], edges };
}

function quote(label: string) {
  return `"${label.replace(/"/g, "#quot;")}"`;
}

export function toMermaid(
  content: Pick<DiagramContent, "title" | "document">,
  direction: "LR" | "TD" = "LR",
) {
  const used = new Map<string, string>();
  const idOf = (id: string) => {
    const known = used.get(id);
    if (known) return known;
    const safe = RESERVED.test(id) ? `${id}_` : id;
    used.set(id, safe);
    return safe;
  };
  const children = new Map<string | null, DiagramNode[]>();
  for (const node of content.document.nodes) {
    const parent = node.parentId ?? null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const lines = [`---`, `title: ${quote(content.title)}`, `---`, `flowchart ${direction}`];
  const shape = (node: DiagramNode) => {
    const label = quote(node.label);
    switch (node.kind) {
      case "decision":
        return `{${label}}`;
      case "result":
        return `([${label}])`;
      case "note":
        return `>${label}]`;
      default:
        return `[${label}]`;
    }
  };
  const write = (parent: string | null, depth: number) => {
    const indent = "  ".repeat(depth);
    for (const node of children.get(parent) ?? []) {
      if (children.get(node.id)?.length) {
        lines.push(`${indent}subgraph ${idOf(node.id)}[${quote(node.label)}]`);
        write(node.id, depth + 1);
        lines.push(`${indent}end`);
      } else lines.push(`${indent}${idOf(node.id)}${shape(node)}`);
    }
  };
  write(null, 1);
  for (const edge of content.document.edges) {
    const arrow =
      edge.kind === "feedback" ? "-.->" : edge.kind === "reference" ? "---" : "-->";
    const label = edge.label ? `|${quote(edge.label)}|` : "";
    lines.push(`  ${idOf(edge.source)} ${arrow}${label} ${idOf(edge.target)}`);
  }
  return lines.join("\n") + "\n";
}

/** Strips an optional `--- title: … ---` front matter block. */
export function mermaidTitle(source: string) {
  const front = /^\s*---\s*\n([\s\S]*?)\n---\s*\n/.exec(source);
  const title = front && /^title:\s*(.+)$/m.exec(front[1]);
  return {
    title: title ? cleanLabel(title[1]) : undefined,
    body: front ? source.slice(front[0].length) : source,
  };
}
