# Changelog

## v0.2.0 — 2026-11-16

- Run as a local, single-user app without accounts: remove sign-in, OAuth, consent and personal access tokens, along with better-auth and its dependencies.
- Refuse requests whose `Host` is not loopback (DNS rebinding) and requests from other websites' origins, for pages, the API and MCP.
- Connect Claude Code or Codex with no credentials through the bundled `.mcp.json` and `.codex/config.toml`, or one `mcp add` command each.
- Move existing diagrams, revision history and mutation receipts to the local owner on upgrade; setup removes obsolete secrets and `.mefagram/local-access.json`.
- Remove hosted (Vercel/Netlify) deployment support.
- Serve on port 4747 by default instead of 3000, so Mefagram runs alongside other development servers.
- Add a feedback channel: developers comment on nodes and diagrams; agents read them with `get_feedback`, reply with `resolve_feedback` and ask with `ask_developer`.
- Stream changes live to the workspace and highlight the nodes an agent changed; agents see what the developer has open with `get_current_view`.
- Create diagrams from Mermaid flowcharts and export Mermaid or standalone SVG; the import dialog accepts `.mmd` files.
- Group diagrams by project and link nodes to code (file and line) that opens in VS Code, Cursor, Windsurf or Zed.
- Return a `viewUrl` from MCP tools; `?node=` opens a node in its phase.
- Add the `mefagram` CLI: a stdio MCP bridge that starts the workspace on demand, `start`/`stop`/`status`/`open`, and `export`/`import` for repository files.
- Add a Claude Code plugin and marketplace with skills to map processes, map the codebase and handle feedback.
- Simplify the reading view, and stop a clicked node from recentring the map.
- Refuse a second process opening the same local database.

## v0.1.2 — 2026-11-05

- Use English throughout the interface, accessibility labels, authentication, errors and revision summaries. Present known legacy system summaries in English without rewriting stored history.
- Fix case-insensitive English node searches, including words containing a capital I.
- Use English date formatting and preserve Unicode diagram names in exported filenames.
- Keep documentation and public fixtures in English, with one concise README and installation guide.
- Preserve saved diagrams, credentials and revision history during upgrades.

## v0.1.1 — 2026-11-05

- Use the fictional Relay newsletter workflow consistently in the README, optional setup and empty-workspace action.
- Preserve edited samples and history when upgrading an existing installation that uses the legacy example option.
- Keep the legacy template endpoint as an alias and replay pre-upgrade template requests safely; unrelated mutation-key reuse remains rejected. Add authenticated HTTP and real CLI coverage.
- Exclude Netlify deployment state from source control and private deployment traces.
- Pin the patched development-only minimatch dependency without downgrading Next.js tooling.

## v0.1.0 — 2026-11-04

First public release of the private Agent–Diagram–User workspace.

- Reading-first interactive canvas with hierarchy, details, search, editing and revision history.
- One canonical installation shared by its owner's agents through authenticated HTTP MCP; OAuth/PKCE and scoped personal tokens.
- Durable PGlite locally or external Postgres for hosted/stateless deployments, with explicit revision conflicts and retry-safe mutations.
- Empty, configurable installation; optional example; repeat setup preserves existing identity, credentials and edited data.
- Portable JSON, stopped-database backup/restore instructions and tested previous-version upgrade.
- MIT licensing, contribution/security guides, installation documentation, and Linux/Node 24 CI with real PostgreSQL and production-browser tests.

Verification: 47 CI tests and 12 production Chromium flows passed. Real-clone acceptance includes two HTTP MCP clients, restart persistence, custom external-directory restoration and an upgrade from e557bab. See [the verification record](docs/verification.md) for evidence and limits.

No hosted service or actual Dot connection is included in the release. Each user supplies their own private installation; hosting costs and free quotas depend on their provider.
