# Portable installation

The approved scope is to make this existing private, agent-editable diagram reader reusable from GitHub. Keep the current Next.js, PGlite/Postgres and MCP architecture. Each installation owns its data; this change does not create a shared public service or deploy one.

The latest user direction is authoritative: finish and publish a free, contribution-friendly general release before provisioning our personal installation. Each user's installation exposes one authenticated MCP/API endpoint and one canonical database shared by that user's agents and reading UI. Agents may install the client/repository in cloud workspaces, but must not fork the canonical live data into one local database per task. MCP callers receive scoped application access, not database administrator credentials. Public source ownership is separate from private diagram ownership.

## Installation contract

- `npm ci && npm run setup && npm run build && npm start` works from a clean clone with Node.js 24+.
- A new workspace starts empty, with a generic owner. `--name` / `--email`, or `MEFAGRAM_OWNER_NAME` / `MEFAGRAM_OWNER_EMAIL`, customize the bootstrap identity. CLI arguments override environment, which overrides saved configuration.
- `npm run setup -- --example mefa-apps` explicitly adds the proposed sample. Repeating it must not duplicate or reset the sample, including after edits.
- Existing owner identity, secrets, credentials, diagrams and revision history survive repeat setup and upgrades. Selecting another owner fails without rewriting working configuration. Setup is run only while the local server is stopped.
- Private data and credential files stay outside version control and deployment bundles.

## Approach

Generalize the existing unattended setup script instead of adding an onboarding server or a hosted dependency. The DB remains authoritative for an existing owner's identity. Existing installations keep their original identity and content; only fresh installations receive generic defaults. Installation options must not rename an existing account silently.

Document local setup, optional samples, configuration, backups/restores, upgrades, agent connection, and private hosting separately. Add MIT licensing for this repository's code; dependencies retain their own licenses. Keep all interface text and documentation in English and preserve the reading-focused experience.

## Acceptance

Test the real setup CLI against disposable persistent databases, including optional sample idempotency, custom configuration, ownership mismatch and secret preservation. From clean local Git clones, install dependencies and build production; create and update a diagram through MCP, restart/reopen it in a fresh browser, upgrade an actual previous checkout without losing its records, and restore a stopped-DB backup. Run typecheck, lint, existing tests and production browser tests. Record the source commits, commands and observed results; do not claim remote hosting or actual Dot connectivity.

GitHub publication is the final release step after this local preparation and verification.

Release requirements: English quick start and documentation, MIT license for original code, contributor/security guidance, CI on standard public GitHub runners, shared-MCP concurrency evidence, optional external-Postgres verification in CI, and explicit documented boundaries for hosted-provider/Dot acceptance. No provider, paid plan, public tunnel, or personal cloud installation is activated for this release.
