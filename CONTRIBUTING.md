# Contributing to Mefagram

Bug reports, documentation, translations, accessibility improvements, layout work and code contributions are welcome. Start with an issue for changes that affect the data format, authentication or deployment model. Small focused fixes can go directly to a pull request.

## Local development

Use Node.js 24+. Run `npm ci`, `npm run setup`, then `npm run dev`. A fresh installation is empty. Add the fictional newsletter sample explicitly with `npm run setup -- --example newsletter` while the server is stopped.

The interface currently uses Turkish copy; the README and developer documentation are in English, with a [Turkish quick start](docs/README.tr.md). Diagrams can contain text in any language. Translation contributions are welcome.

## Changes and checks

1. Fork the repository and create a focused branch.
2. Preserve the shared MCP/API + database architecture. All agents for one installation use its canonical service. Do not introduce a separate live diagram copy per agent.
3. Add a reproducing test for data integrity, auth, concurrency or behaviour fixes. Tests should prove the behaviour, using disposable fixtures rather than personal data.
4. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. The build automatically rejects private workspace files in deployment traces.
5. For UI, persistence or HTTP changes, install Chromium with `npx playwright install chromium`, then run `MEFAGRAM_TEST_PRODUCTION=1 npm run test:e2e`. On Windows, set that environment variable using your shell's syntax. Run one browser-test invocation at a time.
6. Describe the problem, resulting behaviour, validation and any limits in the pull request. Keep unrelated formatting/refactors separate.

CI uses an ephemeral PostgreSQL service and standard Ubuntu runners. `TEST_DATABASE_URL` enables the native PostgreSQL tests; they create and remove a uniquely named test database, so the disposable test role needs `CREATEDB` permission. The app uses the database's default `public` schema, including its generated auth foreign keys. Never point test configuration at a personal or production database/server. Without this variable, the three native-PostgreSQL cases are skipped; persistent PGlite tests still run.

Browser tests reserve `.mefagram/e2e-*` for disposable data. Keep `.mefagram`, `.env.local`, credentials, access tokens, personal diagram exports and test reports out of Git. Use synthetic examples in issues, screenshots and test fixtures. Never run setup against a local PGlite database already open in another process.

## Compatibility

The scoped `minimatch` override under `@typescript-eslint/typescript-estree` applies the fix for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) without downgrading Next.js tooling. Node 24 is compatible; lint/typecheck and installation are verified with this override. Remove it when the upstream dependency range includes the patched release.

Preserve stable node and edge IDs and the versioned export format. Schema changes need a migration and upgrade/restore coverage; do not rewrite already-applied migrations. Changing the MCP contract requires updating its input descriptions and agent documentation. Require expected revisions and retry-safe mutation IDs for writes.

## Community and licensing

Be considerate, explain tradeoffs and assume good intent. Contributions are provided under the project's [MIT license](LICENSE). Dependencies retain their own licenses. For sensitive security reports, follow [SECURITY.md](SECURITY.md).
