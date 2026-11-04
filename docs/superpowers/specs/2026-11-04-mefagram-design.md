# Mefagram: agent-editable diagram workspace

## Intent and accepted scope

Build a private diagram collection for one person reading and analysing maps on a Mac. Codex agents and Dot perform most content creation and updates. The first map is a clearly labelled proposed Mefa Apps workflow, not a verified record of the studio's existing processes. The user approved starting implementation on 2026-11-04 after choosing a structured React Flow viewer, persistent database, authenticated MCP/API, and portable JSON.

The user has an existing Codex/Dot subscription and wants zero additional service or SDK fees. iPhone access is explicitly out of scope. Hosting is optional; the application must really work locally. A hosted setup is useful for Dot to work while the Mac is unavailable, but is not equivalent to offline access.

## Requirements

- Named, searchable multiple diagrams; create, reopen, update, archive, export and import.
- A real interactive React Flow canvas: pan, zoom, fit, keyboard navigation, readable automatic layout, hierarchical overview/detail, selected-node relationships, notes and source links.
- Default to reading. Provide deliberate editing controls for nodes, edges, title and notes rather than displaying a whiteboard toolbar at all times.
- Persist all diagram content, stable node/edge IDs and revision history in Postgres. Never fall back to browser-only storage or ephemeral production filesystem storage.
- Require authentication for every data route and MCP operation. No public registration. A private owner bootstrap creates the first account; further accounts cannot be registered by visitors.
- Expose discoverable, typed MCP tools for searching, reading, creating, patching and exporting diagrams. Supply HTTP/OAuth for Dot and a personal-token or stdio path for local agents. Tools return saved IDs and revisions.
- Validate graph integrity, URLs, limits and unique IDs. Apply a patch atomically. Require expected revision for updates and reject conflicts. Make mutation retries idempotent.
- Keep audit revisions and support restoring a previous revision as a new revision. JSON export must preserve content and support reimport.
- Use actual persistent local Postgres through PGlite for development and tests. Support hosted Postgres via DATABASE_URL; deployed builds require hosted storage and valid auth configuration.

## Approaches and decisions

We considered an Excalidraw whiteboard, Git-backed diagram files, and a structured React Flow workspace with MCP/DB. Excalidraw's OSS editor is free but its drawing model needs more custom adaptation for semantic node details. Git-backed files are portable but introduce per-copy synchronisation and publishing steps. The accepted direction is React Flow with shared database operations exposed to both UI and agents.

Implementation calls: Next.js App Router and TypeScript; React Flow; ELK layout loaded in the browser; Better Auth for sessions and OAuth 2.1; Drizzle with PGlite locally and pg for hosted Postgres; official MCP server SDK via mcp-handler. Exact installed stable versions and lockfile are the version authority. No model API is required.

Vercel + Neon Free is a candidate, subject to free resource availability, account permissions and Hobby plan usage conditions. Do not silently activate a paid plan. The GitHub source repo is public: never commit user data, database files, secrets or tokens. Sample workflow content is public template material.

## Product and visual direction

The interface is a working atlas rather than a whiteboard: quiet collection navigation, a broad diagram viewport and a contextual inspector. Turkish product copy. Short node labels; long explanations and sources live in the inspector. Graph hierarchy and relation types drive overview/detail, filtering and focus.

Palette: paper #f8fafc, ink #233044, slate #68758a, indigo #4054a5, mist #e8edf4, sage #3f7267. Manrope for interface text, Newsreader for document headings. No decorative gradients, marketing hero, animated connectors or dashboard KPI cards. Distinctive content is the lifecycle map itself. Use sequence markers only for actual ordered phases. The design is restrained to protect the user's attention on large maps.

Layout sketch:

    collection/search | title + reading controls       | selected item
    diagram list      |                               | explanation
    new/import        | interactive map               | notes/sources
                      | zoom / fit / breadcrumb       | connections

The reading controls include an overview, drilling into one phase, searching nodes, focusing neighbours and a list alternative. Edits use a separate intentional mode/dialog. A save result is shown only after the database confirms it; errors leave the editor's input available for retry.

## Integration and privacy

The same diagram service must enforce ownership, validation, revisions and transactions for browser and MCP callers. OAuth tokens are bound to the MCP audience and granted scopes. Personal access tokens are hashed, revocable and shown once. A token never grants access to SQL or deployment administration. Tool descriptions instruct agents to read before patching and preserve existing IDs and unrelated content.

Local app execution is supported. A remote Dot connection requires an authenticated reachable endpoint. Do not describe local/Inspector tests as a verified Dot connection. Production reachability and the actual Dot invocation are separately recorded acceptance checks.

## Verification and completion evidence

Prove real DB create -> read -> update -> close/reopen persistence; ownership rejection; invalid graphs; stale revisions; concurrent edits; retry deduplication; rollback on invalid patches; export/import; and revision restore. Browser checks cover collection search, detail drill-down, read/edit mode, refresh, independent sessions and saving errors. Use a real MCP client to discover and invoke tools, then reopen the same record through the browser. Check dense map layout and keyboard interaction. Test a built production server as well as development.

Record local persistence, browser/session checks, MCP checks, hosted DB/deployment checks and actual Dot connection separately in docs/verification.md. A screenshot demonstrates layout only. Never mark external setup complete without a working connected resource and direct read-back evidence.

