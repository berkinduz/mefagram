# Portable Installation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution, with one fresh-context release review. The user stopped the earlier side agent and asked the main agent to finish the common release.

**Goal:** A stranger can clone Mefagram, configure their own private workspace, preserve it through upgrades, and connect agents.

**Architecture:** Keep one private workspace per installation, the existing persistent database and authenticated HTTP MCP. Generalize bootstrap defaults and make the existing example explicit; do not change the diagram model.

**Tech Stack:** Existing Node.js 24+, Next.js, Better Auth, PGlite/Postgres, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-portable-setup-design.md`

## Global Constraints

- Work in the isolated `portable-setup` worktree, preserving the main checkout and its live data.
- No hosted resources, paid services, or public tunnels.
- Setup runs only against stopped/disposable local databases.
- Keep credentials, `.env.local`, data and personal exports out of Git and deployment bundles.

## Review Focus

- Repeated setup must not reset credentials or create duplicate samples.
- Existing owner mismatch must fail before rewriting configuration.
- Environment-only custom database settings must persist for the subsequent app start.
- Empty secret placeholders in `.env.example` must generate usable secrets.
- A real prior checkout's records and full history must survive upgrading and restoring a backup.

### Task 1: Generalize bootstrap and optional sample

**Files:** `scripts/setup.ts`, `scripts/test-server.ts`, `.env.example`, `tests/setup.test.ts`.
**Interfaces:** Keep existing private access-file format and all application APIs. Add `--name`, `--email`, `--example mefa-apps`, `--help`; retain reserved `--e2e` fixture mode.

- [x] Write real CLI tests for blank defaults, configured identity/path, repeat setup, edited sample idempotency, copied example environment, and rejected owner changes.
- [x] Run `npx vitest run tests/setup.test.ts`; observe failures against the original setup.
- [x] Implement options, configuration validation/preservation and explicit idempotent sample creation; explicitly request the sample for browser fixtures.
- [x] Run setup tests and the existing suite; expect all passing.
- [x] Commit the behavior and its tests.

### Task 2: Reusable documentation and licensing

**Files:** `README.md`, `.env.example`, `docs/installation.md`, `docs/deployment.md`, `docs/agent-integration.md`, `CONTRIBUTING.md`, `LICENSE`, `package.json`, `package-lock.json`.
**Interfaces:** Document Task 1's exact commands/configuration. Preserve public MCP tool and export contracts.

- [x] Explain install/start, custom identity, optional sample, data location, stopped-DB backup/restore and update/rollback commands.
- [x] Explain independent agent installations versus one private shared endpoint; keep hosting optional and remote acceptance explicitly unverified.
- [x] Add MIT license/metadata and contribution/test instructions; remove personal account troubleshooting from public deployment instructions.
- [x] Add public-repository CI, a real Postgres service test, and independent MCP client concurrency coverage. Refuse ephemeral data fallback on serverless platforms. No personal deployment is provisioned.
- [x] Run typecheck, lint, tests, production build/privacy check and production browser suite; expect all passing.
- [x] Commit the public-facing documentation.

### Task 3: Clean-clone and upgrade acceptance

**Files:** reproducible acceptance script and `docs/verification.md`.
**Interfaces:** Real Git clones, real setup CLI, real persistent DB, production server, authenticated MCP and fresh browser sessions.

- [x] Verify a clean clone: `npm ci`, empty setup, production build, login, MCP create/update, restart and read-back.
- [x] Bootstrap previous commit `e557bab`, save edited fixture/history, upgrade to this branch, rerun setup, verify preserved owner/credentials/records/history.
- [x] Restore a stopped local backup and read it with the production app; verify the restored MCP credential and browser login.
- [x] Record precise evidence and limits, obtain one independent release review, and fix Important findings with reproducing tests.
- [x] Publish the verified common source to GitHub and check CI. Release publication follows this gate: promote the verified source to main and create v0.1.0 with honest release notes. Do not start a personal installation in this task.
