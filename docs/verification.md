# Verification record — v0.1.0

Evidence is recorded separately for the application, its portable installer and a particular hosted deployment. Fixtures are synthetic. Private databases, credentials and raw local reports are excluded from Git and deployment bundles.

## Automated application checks

| Check | Observed coverage |
| --- | --- |
| TypeScript and ESLint | Type checking and lint pass |
| Local tests | 44 tests pass in 8 files; 3 native Postgres tests require `TEST_DATABASE_URL` and are skipped without it |
| Native Postgres | Separate integration suite covers real auth/login/token, ownership, concurrent writes/history, reopen and JSON round-trip; CI supplies an isolated PostgreSQL service |
| MCP | Official SDK clients exercise tool discovery, create/read/update, scope checks, stale writes and two independent clients sharing canonical state |
| OAuth | Real HTTP authorization flow: discovery, dynamic registration, login/consent, PKCE exchange and resource-bound access token |
| Installer | Real CLI processes test empty defaults, identity/storage configuration, repeated setup, edited sample/history preservation, mismatch rejection, blank secrets, options and Next-compatible environment escaping |
| Storage guards | Vercel, Netlify and explicit stateless mode reject silent local database fallback |
| Browser | 12 production Chromium flows cover reading/drill/list, keyboard interaction, saved edits/reload, independent sessions, real MCP-to-UI writes, retries, async ordering, near-limit JSON round-trip and rejected sign-out |
| Production build | Optimized Next.js build and automatic privacy check pass; 14 trace manifests exclude private workspace/configuration/test files |

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then `MEFAGRAM_TEST_PRODUCTION=1 npm run test:e2e` (install Chromium first). One browser suite at a time: it uses reserved disposable `.mefagram/e2e-*` paths and port 3100. The ordinary workspace database is not used.

CI runs the same checks on Linux/Node 24 with a dedicated PostgreSQL service. The optional native integration test creates and drops only its own random database; the disposable role requires `CREATEDB`. Use a disposable test server, never personal production, for `TEST_DATABASE_URL`.

## Portable installation acceptance

`npm run verify:installation` is an opt-in, real-clone acceptance command. It creates private temporary clones and logs under the OS temporary directory; it does not open the current workspace database or read its credentials. It needs Git, npm, Chromium and a free localhost port (default 3290, configurable through `MEFAGRAM_VERIFY_PORT`).

Its assertions cover:

1. Clone committed source, run `npm ci`, create an empty workspace and compile production.
2. Two independent HTTP MCP clients read the same diagram; concurrent writes have exactly one winner and one revision conflict.
3. A fresh production browser signs in and displays the saved note.
4. Stop/restart the actual server, then reread the saved revision through MCP and another browser session.
5. Use a custom absolute database directory outside the checkout; back up that entire stopped directory together with credentials/configuration, move the originals aside, restore the copies, and verify the original agent credential and browser login against the restored production server.
6. Clone previous commit `e557bab`, bootstrap and customize its sample, switch to the candidate commit, run `npm ci` and setup again, then compare owner, login, token, secret hashes, diagram content and complete revision metadata.

The command writes `result.json`, `commands.log` and synthetic screenshots in its printed private evidence directory. These are local evidence, not release assets. The first acceptance passed for commit `4dd6bcb`, including default-directory backup restoration and the actual previous-version upgrade. The release candidate also repeats it with an external custom database directory. The final acceptance and CI run are recorded before tagging.

## Practical limits

- This release does not provision a hosted instance or certify a particular provider's networking, TLS, pooling, quotas or free-plan eligibility. Native Postgres CI verifies the database implementation, not a hosted account.
- Actual Dot authorization/invocation and Mac-off access require a real reachable private endpoint and client setup; they are not claimed from localhost tests.
- Local acceptance is on macOS with Node 24; CI covers Linux. Windows installation is not independently verified.
- A second browser session is not a test on a second physical device. iPhone support is outside the initial scope.
- Keyboard selection/movement, focus states and list alternatives are tested; a full VoiceOver/WCAG audit has not been performed.
- Layout is heuristic. The browser suite includes a 150-node hierarchical fixture; the 2,000-node/6,000-edge validation limits are not performance guarantees for arbitrary dense graphs.
- The app serves fonts/layout assets locally and has no model/CDN requirement, but an OS-level disconnected-network session has not been tested. Remote AI calls require their own network access.
- JSON transfers current content. Full account/token/history recovery requires a database backup with matching auth configuration. Independent installations do not automatically synchronize data.
