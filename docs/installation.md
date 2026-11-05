# Installation, updates and recovery

Mefagram is free software. Each installation owns its accounts, diagrams and agent credentials. A local installation needs Node.js 24+ and a desktop browser; it does not require Docker, a separately installed database, a model API key or a hosted service.

## First installation

```sh
git clone https://github.com/berkinduz/mefagram.git
cd mefagram
npm ci
npm run setup -- --name "Your name" --email you@example.com
npm run build
npm start
```

Open `http://127.0.0.1:3000`. The generated login password and bootstrap agent token are in `.mefagram/local-access.json`; the terminal prints its path, never the secret values. The email is a login identifier; this version does not send email or provide an email-based password-reset service. Omitting name/email uses `Mefagram owner` and `owner@mefagram.local`.

New installations start empty. For the optional fictional Relay newsletter workflow, stop the app and run `npm run setup -- --example newsletter`, then start it again. Repeating this command reuses the original sample creation; edits are preserved and no duplicate is created. You can also choose the sample from the empty workspace. The sample matches the fictional example shown in the README.

After the initial build, `npm start` reopens the saved workspace. `npm run dev` runs the development server. Keep one Node process per local PGlite directory. If port 3000 is occupied, configure `BETTER_AUTH_URL` for the chosen origin before setup, then start with `npm start -- --port 3200` (using the same port).

The previous example flag remains accepted for compatibility. Repeating it on an older workspace preserves the existing sample and its edits; updates never replace user diagrams.

## Configuration

`.env.example` lists the options. You can copy it to `.env.local` before setup; empty secrets are generated. Setup options take precedence over environment variables, which take precedence over saved configuration. Changing an existing owner's email is rejected. A name option does not rename an existing account. Explicitly supplied secrets must be random and at least 32 characters.

`MEFAGRAM_DATA_DIR` selects a durable local directory; `DATABASE_URL` selects external Postgres. Environment-only storage settings are saved for the next application start. Avoid changing storage targets in place: use a separate checkout/configuration for a new installation and deliberately export/import or migrate data. Setup is not an automatic local-to-cloud migration.

Keep `.env.local` and `.mefagram` private. On POSIX systems, setup writes credential/configuration files with mode 0600. Windows access controls differ and require appropriate private directory permissions. The release verification states which platforms were actually tested.

## Updates

1. Stop the server.
2. Make the full backup below, including `.env.local`.
3. Pull the intended release, or fetch tags and check out a reviewed release tag.
4. Run `npm ci`, `npm run setup`, and `npm run build`.
5. Start the app and confirm login, diagrams, history and agent access.

Repeat setup preserves existing owner identity, secrets and credentials; it does not reset a workspace. Never use `git reset --hard` or `git clean -fdx` as an update recipe: private ignored data lives in this checkout. Read release notes for migration changes. For rollback after a schema migration, restore the matching stopped-DB backup and previous source version together.

## Backup and restore

For local PGlite, stop the app and back up all three of these: the **complete resolved `MEFAGRAM_DATA_DIR`**, the `.mefagram` directory containing credentials, and `.env.local`. Resolve a relative data path from the installation directory. The default `.mefagram/db` is already inside `.mefagram`; a custom path such as `/srv/mefagram-data` is separate and **must also be copied**. Backing up only the checkout would omit that external database and its entire history. Preserve permissions and keep the backup private.

To restore, stop the app, move the current data/configuration aside, and restore the credential directory, `.env.local`, and the entire database directory. Restore an external database to its configured absolute path, or deliberately update `MEFAGRAM_DATA_DIR` to the new restored location. Start the matching release only after all three are in place. Never overlay or copy an open PGlite database.

For hosted Postgres, use database/provider backup and restore tools, and preserve the app's auth configuration separately. Browser JSON export/import transfers the current diagram's nodes, links, hierarchy, notes, sources and positions. It creates a new diagram and does not transfer accounts, tokens or complete revision history.

See [deployment](deployment.md) for a stable shared endpoint and [agent integration](agent-integration.md) for client setup.
