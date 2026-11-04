# Verification record — 2026-11-04

This records observed behaviour, not a completion claim based on screenshots. Application source is on `codex/mefagram-mvp`. Personal credentials, DBs and raw local evidence remain gitignored under `.mefagram`.

## Confirmed locally

| Area                     | Evidence                                                                             | Result                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data service             | `npm test`: 12 diagram tests, real PGlite transactions                               | Create/read/update, filesystem close/reopen, ownership isolation, atomic rollback, exactly one concurrent winner, stale revision rejection, idempotent retries, preserved omitted fields, hierarchy/source validation, export/import/restore pass                                 |
| Account/token security   | 4 auth tests + 4 HTTP API tests                                                      | Private bootstrap, no public signup, hashed scoped expiring tokens, immediate PAT revocation, ownership, authenticated API round-trip and CSRF origin checks pass                                                                                                                 |
| OAuth                    | 1 real HTTP-server OAuth test                                                        | Discovery, dynamic client registration, owner login/consent, authorization code, PKCE exchange and resource-bound token verification pass                                                                                                                                         |
| MCP                      | 2 SDK-client tests and real Next HTTP/browser acceptance                             | Tool discovery, create/update/read, shared DB, write-scope rejection and stale revision errors pass                                                                                                                                                                               |
| Graph/layout             | 8 graph tests                                                                        | Hierarchy projection, internal edge aggregation, true self loops, Turkish search, focus neighbours, non-overlap, exact visible handle endpoints and wrapped linear layout pass                                                                                                    |
| Browser                  | 7 Playwright desktop Chromium flows, 1512×982                                        | Reader/drill-down; keyboard selection and saved arrow move; create/edit/reload + independent context; unauthenticated rejection; real HTTP MCP writes read/exported in UI; lost-response reconciliation; creation retry without duplicates; readable 150-node hierarchy/list pass |
| Production compile       | `npm run build`                                                                      | Next.js optimized build succeeds                                                                                                                                                                                                                                                  |
| Bundle privacy           | `npm run verify:bundle`                                                              | 14 trace manifests contain no `.mefagram`, `.env*`, `.superpowers` or test-report files                                                                                                                                                                                           |
| Process restart          | `verify:integration before-restart`, actual process stop/start, then `after-restart` | Production MCP created revision 1, patched revision 2; restarted server returned the same revision/note; fresh Chromium session read it from the UI without uncaught application errors                                                                                           |
| Agent CLI                | `npm run agent -- list`, `--help`, integration script                                | Real authenticated HTTP MCP used; no direct live DB access or UI automation required for agent edits                                                                                                                                                                              |
| Runtime dependency audit | `npm audit --omit=dev`                                                               | 0 reported production vulnerabilities at verification time                                                                                                                                                                                                                        |

`npm test` currently has **31 passing tests in 6 files**. All seven browser flows also passed against the optimized `next start` production server (8.4 seconds for that run). A different browser context is not a claim that a second physical device was tested. iPhone is explicitly outside this version's scope.

## Reproduce production persistence

Start `npm start` using the generated local workspace. In another terminal:

```sh
npm run verify:integration -- before-restart
```

Stop the Node server, run `npm start` again, then:

```sh
npm run verify:integration -- after-restart
```

The script asserts the saved ID/revision/content through real MCP and a fresh browser. It archives its verification map afterward. Local machine-readable result: `.mefagram/evidence/production-result.json`; screenshot: `.mefagram/evidence/production-mcp-readback.png`. These contain synthetic test content, not a real Mefa Apps project.

For the full production browser suite, build first and run `MEFAGRAM_TEST_PRODUCTION=1 npm run test:e2e`. It provisions a separate disposable fixture DB on port 3100. Do not run multiple test invocations together. The main `.mefagram/db` remains intact.

## Visual inspection

Overview and node-detail screenshots were inspected. Text size/contrast were increased; the selected node now stays inside the resized canvas when the inspector opens. Seven phases wrap across rows. Large phases start at a readable zoom instead of shrinking their labels to fit every node. Branched layouts use the actual ELK web worker; straight processes use deterministic wrapped routing. Normal long notes/source content stays in the inspector and list view.

The 150-node browser fixture has six phases and 24 child steps per phase. It demonstrates overview/drill/list navigation, not a performance guarantee for every 2,000-node/6,000-edge graph. Layout is automatic and heuristic; dense arbitrary cross-links may still need better hierarchy, filtering or manual placement.

## Not completed or not verified

- **Vercel/Neon deployment:** the connector's integration-list call returned 403. The CLI fallback later authenticated and listed the existing Neon Free installation; a team read confirmed Hobby. No new resource, deployment, paid plan or trial was activated. The local option was explicitly allowed by the user; commercial Hobby eligibility is not assumed.
- **Hosted Postgres path:** implemented via `pg` with transactional migrations, but no external Postgres resource was connected/tested. PGlite tests do not prove hosted networking/TLS/pooling behaviour.
- **Actual Dot invocation / remote OAuth:** not connected or exercised. Local MCP and OAuth protocol tests establish the integration path, not Dot installation, remote ingress or Mac-off access.
- **Offline viewing:** the app and fonts/ELK assets are local and have no runtime CDN/model requirement, but an OS-level disconnected-network session was not tested. Remote AI agents still require their network service.
- **Accessibility:** keyboard reading/selection/saved movement, native dialogs, focus styles and list alternative are present; a complete VoiceOver/WCAG audit was not performed.
- **Export scope:** JSON preserves current diagram content, not accounts or complete revision history; full DB backup is separate.
- **Synchronization:** independent local installations have independent data unless deliberately connected to a shared hosted database. No automatic Git or offline multi-device synchronization is implemented.

## Implementation decisions

The user authorized starting the discussed implementation, so design/plan records were written without another approval round. The initially empty checkout was reused on a feature branch; there was no existing work requiring a separate worktree. Local persistence uses PGlite and deployment requires explicit hosted Postgres, avoiding an ephemeral production fallback. Hosting and Dot acceptance are kept separate from working local delivery. No source branch was pushed and no private data was published.

## Final review

One independent whole-branch review is requested after the implementation/verification package is committed. Findings and any reproducing fixes are recorded here before final handoff.
