# Deployment and ownership

The working default costs no hosting fee: run the app and its persistent PGlite database on the Mac. One Node process owns that local database. There is no silent paid service, model API call, public data bucket or browser-only canonical storage.

## Shared hosted deployment

The app supports external Postgres through `DATABASE_URL` using `pg` and transactional migrations. Vercel is a candidate host, not a required dependency. Its filesystem must never hold the canonical DB; startup on Vercel without `DATABASE_URL` fails explicitly.

As checked on 2026-11-04, [Vercel Hobby](https://vercel.com/docs/plans/hobby) limits usage to personal, non-commercial projects. Do not assume a business workflow qualifies solely because one person uses it. [Neon Free](https://neon.com/pricing) currently includes 1 GB storage and 100 CU-hours per project/month. Free quotas, availability and commercial eligibility must be checked when deploying. No paid trial or plan was activated here.

Deployment steps when accounts and an eligible plan are available:

1. Provision a private Postgres database and obtain its TLS connection string, preferably a pooled endpoint for serverless instances. Choose the free plan explicitly.
2. Prepare a private `.env.local` with `DATABASE_URL`, final HTTPS `BETTER_AUTH_URL`, owner email, and independently generated random `BETTER_AUTH_SECRET`/`MEFAGRAM_SETUP_KEY` (at least 32 characters each). `.env.example` documents names only.
3. Stop any local process using the same local DB. Run `npm run setup` with that environment to migrate the hosted DB and bootstrap its single owner. Keep the resulting private credential file. Browser signup is otherwise closed.
4. Set the same server environment variables on the host. Do not prefix secrets with `NEXT_PUBLIC_`. Keep preview and production databases/URLs separate. Do not point previews at personal production data.
5. Deploy this source with `npm ci` and `npm run build`. Postinstall prepares the ELK browser worker. Set a supported Node.js 24 runtime.
6. Check the final HTTPS URL, login, create/update/reload, an independent session and token revocation. Use `npm run verify:bundle` to reject private files in traced bundles. `.vercelignore` also excludes local credentials/data from CLI upload.
7. Export/import a local diagram if transferring content; this does not transfer accounts, credentials or history. For a full local backup, stop the app and copy `.mefagram` plus `.env.local` privately. For hosted DBs, use the provider's backup/export tools and keep an independent backup.
8. Add the final `/api/mcp` endpoint to the intended agent. Run its real OAuth/consent or token connection, invoke create/update/read, then verify the same saved revision in the browser. Keep this evidence separate from localhost tests.

Changing the public origin changes OAuth audience, issuer and cookie context; reconnect agents after an origin change. Do not deploy until a usable durable database and valid auth secrets exist. Keep session and Postgres credentials private even though this source repository is public.

## Current external limitation

The Vercel connector can list the user's team, but listing integration configurations returned **403 forbidden: no permission to list the integration configuration**. The CLI fallback subsequently completed its login flow and successfully listed the existing Neon Free installation. A scoped team read confirmed the personal team uses Hobby. No Neon database or Vercel deployment was created: the default delivery remains the explicitly allowed local installation, with no extra spending. Mefa Apps business use should not silently be treated as eligible Hobby usage. Actual Dot connectivity was not tested.

The useful next external step is selecting an eligible zero-cost host/data setup, followed by a real Dot connection. The local application does not depend on completing that step. The now-authenticated CLI may be used for that work; the connector's separate 403 is not a blanket deployment prohibition.
