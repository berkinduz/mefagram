# Security

Please report vulnerabilities through this repository's **Security → Report a vulnerability** feature. Do not disclose credentials, private diagrams or exploitable details in a public issue. If private reporting is unavailable, open a minimal issue asking for a private reporting channel without including the vulnerability.

The latest tagged release is the supported version. This is a small open-source project; response times are not guaranteed.

## Deployment boundary

Each installation has one private owner. It is not a public multi-tenant service. Public signup is closed. Human sessions and scoped OAuth/personal tokens access the same ownership-checked diagram service. Agents do not need database or deployment administrator credentials.

Serve remote installations over HTTPS and keep application secrets/database credentials private. Personal tokens revoke immediately. Already-issued OAuth JWT access tokens may remain valid for up to five minutes after grant revocation. JSON export carries the current diagram; full database backups also contain accounts, credentials and history and must remain private.

Use a durable local volume for PGlite, with only one Node process opening it. Use an external Postgres database for stateless/serverless hosts. Set `MEFAGRAM_REQUIRE_DATABASE_URL=true` on such hosts; Vercel and Netlify also enforce this automatically. Never let production fall back to ephemeral local files.
