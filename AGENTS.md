<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mefagram workspace

- Mefagram is a local, single-user app with no accounts. Each person has one installation/database; all their agents share its loopback MCP endpoint (`http://127.0.0.1:3000/api/mcp`, no credentials). Clones are independent installations, not data synchronization. Keep the common project free of personal deployment assumptions.
- Run `npm run setup` once before starting the app. Keep `.mefagram`, `.env.local` and personal diagram exports out of git and bundles.
- The loopback Host/Origin guard (`src/proxy.ts`, `src/lib/http/local.ts`) is the only access control. Never weaken it or bind the server to a non-loopback interface.
- For content work, use the running MCP endpoint or `npm run agent -- ...`; do not open or edit its live PGlite files. Read [docs/agent-integration.md](docs/agent-integration.md) first.
- Read a diagram before patching it. Preserve stable IDs/unrelated content. Supply expected revision and a unique mutation ID; retry an identical failed response with the same ID. Reconcile revision conflicts explicitly.
- The bundled newsletter example is fictional. Keep README, installer and UI examples aligned. Never publish an owner’s project content, credentials or screenshots as public fixtures.
- Use English for interface text, error messages, documentation and public fixtures. Preserve user-provided diagram content; do not translate existing data during upgrades.
- Keep the human experience focused on reading and analysis: short labels, hierarchical phases, notes/sources in details, deliberate editing.
- Use real persistence tests for changes to the data and local-access paths. Run typecheck, lint and the affected tests. Test the production build and bundle privacy when changing runtime/deployment code.
- `npm run test:e2e` uses disposable `.mefagram/e2e-*` fixtures. Do not run multiple Playwright invocations concurrently; they share that fixture server and report directory. Use `MEFAGRAM_TEST_PRODUCTION=1 npm run test:e2e` after a build to test production.
