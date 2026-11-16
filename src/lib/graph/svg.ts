import type { DiagramContent } from "@/lib/diagrams/schema";
import { layoutGraph } from "./layout";
import { breadcrumbsFor, projectGraph } from "./projection";

// A standalone SVG of one level of a diagram (the overview or a phase), laid
// out exactly like the workspace. It embeds no fonts or scripts, so it can be
// committed next to code or pasted into a pull request.

const TONES = ["#6c7eaf", "#639183", "#af926c", "#9783b6", "#7999ad", "#7b8aa7", "#a58c7d"];

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Greedy word wrap by an approximate character budget. */
function wrap(text: string, perLine: number, lines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= perLine) line = candidate;
    else {
      if (line) result.push(line);
      line = word.length > perLine ? `${word.slice(0, perLine - 1)}…` : word;
    }
    if (result.length === lines) break;
  }
  if (line && result.length < lines) result.push(line);
  const used = result.join(" ").length;
  if (used < text.trim().length && result.length) {
    const last = result.length - 1;
    result[last] = `${result[last].replace(/[.,;:]?$/, "").slice(0, perLine - 1)}…`;
  }
  return result;
}

export async function toSvg(
  content: Pick<DiagramContent, "title" | "document">,
  options: { scopeId?: string | null } = {},
) {
  const scopeId = options.scopeId ?? null;
  const graph = projectGraph(content.document, { scopeId, showFeedback: true });
  const layout = await layoutGraph(graph, { wrapColumns: 3, worker: false });
  const pad = 32;
  const header = 56;
  // Edge labels first, so the canvas bounds include them.
  const centreX =
    layout.nodes.reduce((sum, node) => sum + node.position.x + node.width / 2, 0) /
    Math.max(1, layout.nodes.length);
  const labels = layout.edges.flatMap((edge) => {
    if (!edge.label || edge.points.length < 2) return [];
    // The longest segment has the most room; vertical runs keep the label
    // beside the line, on the side facing away from the cards.
    let best = 0;
    let length = -1;
    for (let index = 0; index < edge.points.length - 1; index++) {
      const a = edge.points[index];
      const b = edge.points[index + 1];
      const size = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (size > length) {
        length = size;
        best = index;
      }
    }
    const a = edge.points[best];
    const b = edge.points[best + 1];
    const text = edge.label.length > 32 ? `${edge.label.slice(0, 31)}…` : edge.label;
    const w = text.length * 6.2 + 14;
    const vertical = Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 0;
    const x = vertical
      ? a.x < centreX
        ? a.x - 8 - w / 2
        : a.x + 8 + w / 2
      : (a.x + b.x) / 2;
    return [{ x, y: (a.y + b.y) / 2, w, text }];
  });
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const extend = (x1: number, y1: number, x2: number, y2: number) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  };
  for (const node of layout.nodes)
    extend(
      node.position.x,
      node.position.y,
      node.position.x + node.width,
      node.position.y + node.height,
    );
  for (const edge of layout.edges)
    for (const point of edge.points) extend(point.x, point.y, point.x, point.y);
  for (const label of labels)
    extend(label.x - label.w / 2, label.y - 10, label.x + label.w / 2, label.y + 10);
  const width = Math.ceil(Math.max(maxX - minX + pad * 2, 360));
  const height = Math.ceil(maxY - minY + pad * 2 + header);
  const crumbs = scopeId
    ? breadcrumbsFor(content.document, scopeId).map((node) => node.label)
    : [];
  const heading = [content.title, ...crumbs].join(" › ");
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">`,
    `<title>${escape(heading)}</title>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#8a97ad"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    `<text x="${pad}" y="${pad + 8}" font-size="18" font-weight="600" fill="#273650">${escape(heading)}</text>`,
    `<g transform="translate(${pad - minX} ${pad + header - minY})">`,
  );
  for (const edge of layout.edges) {
    const points = edge.points.map((point) => `${point.x},${point.y}`).join(" ");
    const dash =
      edge.kind === "feedback"
        ? ` stroke-dasharray="5 5"`
        : edge.kind === "reference"
          ? ` stroke-dasharray="2 4"`
          : "";
    const colour = edge.kind === "feedback" ? "#c4a46e" : "#8a97ad";
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="1.5"${dash}${
        edge.kind === "reference" ? "" : ` marker-end="url(#arrow)"`
      }/>`,
    );
  }
  for (const node of layout.nodes) {
    const { x, y } = node.position;
    const tone = TONES[node.colourIndex % TONES.length];
    parts.push(
      `<g transform="translate(${x} ${y})">`,
      `<rect width="${node.width}" height="${node.height}" rx="9" fill="#fff" stroke="#d7dfeb"/>`,
      `<rect width="4" height="${node.height - 18}" x="0" y="9" rx="2" fill="${tone}"/>`,
    );
    let cursor = 30;
    if (node.kind !== "phase" && node.kind !== "step") {
      parts.push(
        `<text x="17" y="24" font-size="11" font-weight="650" fill="${tone}">${escape(
          node.kind[0].toUpperCase() + node.kind.slice(1),
        )}</text>`,
      );
      cursor += 20;
    }
    for (const line of wrap(node.label, 28, 2)) {
      parts.push(
        `<text x="17" y="${cursor}" font-size="15" font-weight="700" fill="#334561">${escape(line)}</text>`,
      );
      cursor += 20;
    }
    for (const line of wrap(node.description, 38, 2)) {
      parts.push(
        `<text x="17" y="${cursor + 2}" font-size="12" fill="#5f6f87">${escape(line)}</text>`,
      );
      cursor += 18;
    }
    if (node.childCount)
      parts.push(
        `<text x="17" y="${node.height - 14}" font-size="11" font-weight="550" fill="#5f6f87">${node.childCount} ${
          node.childCount === 1 ? "step" : "steps"
        } ›</text>`,
      );
    parts.push(`</g>`);
  }
  // Labels last, above cards, as in the workspace.
  for (const label of labels)
    parts.push(
      `<rect x="${label.x - label.w / 2}" y="${label.y - 10}" width="${label.w}" height="20" rx="10" fill="#fff" stroke="#e3e9f2"/>`,
      `<text x="${label.x}" y="${label.y + 4}" font-size="11" text-anchor="middle" fill="#5f6f87">${escape(label.text)}</text>`,
    );
  parts.push(`</g></svg>`);
  return parts.join("\n") + "\n";
}
