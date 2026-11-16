---
name: map-codebase
description: Use when the user asks for an architecture diagram, a map of how this repository or a feature works, a request/data flow through the code, or an onboarding overview of the codebase. Builds a Mefagram diagram whose nodes link to the exact files and lines.
---

# Map this codebase

Produce an architecture or flow map of the current repository in Mefagram, where every node points at the code that implements it.

## Steps

1. **Scope it.** Ask yourself which question the map answers ("how does a request reach the database?", "what are the main modules?"). One map per question; suggest a second map instead of overloading one.
2. **Find existing maps.** `list_diagrams` with `project` = repository folder name. Update a matching map rather than duplicating it.
3. **Read the code** enough to be accurate: entry points, module boundaries, the main call path. Note file paths and the line of the key function or class for each step.
4. **Create** with `create_diagram_from_mermaid`:
   - `project`: the repository folder name.
   - `projectRoot`: the absolute path of the repository root (so links open in the editor).
   - Phases (`subgraph`) = layers or modules; steps = components or calls in order.
   - `-->` for calls and data flow, `-.->` for async/callback/feedback, `---` for "uses / depends on".
5. **Attach code references.** One `update_diagram` call with `update_node` operations: `code: [{ "path": "src/server/router.ts", "line": 42, "label": "route()" }]` (paths relative to `projectRoot`), plus a one-sentence `description` per node. Add design decisions or caveats to `notes`.
6. **Share** the `viewUrl` and summarise the map in 3–5 bullets. Offer to export it for the repo: `export_diagram` with `format: "svg"` or `"mermaid"`, written to `docs/diagrams/<name>.svg|.mmd`.
7. Check `get_feedback` and address any comments.

## Accuracy

- Only reference files and lines you have read. Do not invent paths.
- Prefer fewer, correct nodes over exhaustive coverage. 15–40 nodes is a good size.
- When the code changes later, update the existing map's nodes and code references.
