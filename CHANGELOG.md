# Changelog

## v0.1.0 — 2026-11-04

First public release of the private Agent–Diagram–User workspace.

- Reading-first interactive canvas with hierarchy, details, search, editing and revision history.
- One canonical installation shared by its owner's agents through authenticated HTTP MCP; OAuth/PKCE and scoped personal tokens.
- Durable PGlite locally or external Postgres for hosted/stateless deployments, with explicit revision conflicts and retry-safe mutations.
- Empty, configurable installation; optional example; repeat setup preserves existing identity, credentials and edited data.
- Portable JSON, stopped-database backup/restore instructions and tested previous-version upgrade.
- MIT licensing, contribution/security guides, English and Turkish installation documentation, and Linux/Node 24 CI with real PostgreSQL and production-browser tests.

Verification: 47 CI tests and 12 production Chromium flows passed. Real-clone acceptance includes two HTTP MCP clients, restart persistence, custom external-directory restoration and an upgrade from e557bab. See [the verification record](docs/verification.md) for evidence and limits.

No hosted service or actual Dot connection is included in the release. The interface is currently Turkish. Each user supplies their own private installation; hosting costs and free quotas depend on their provider.
