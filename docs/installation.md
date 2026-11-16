# Installation, updates and recovery

Mefagram is free software that runs on your own computer. It needs Node.js 24+ and a desktop browser; it does not require Docker, a separately installed database, a model API key, an account or a hosted service.

## First installation

```sh
git clone https://github.com/berkinduz/mefagram.git
cd mefagram
npm ci
npm run setup
npm run build
npm start
```

Open `http://127.0.0.1:4747`. There is no login. The workspace belongs to whoever uses this computer, and the server refuses requests that are not addressed to `localhost`, `127.0.0.1` or `[::1]`, or that come from another website.

New installations start empty. For the optional fictional Relay newsletter workflow, stop the app and run `npm run setup -- --example newsletter`, then start it again. Repeating this command reuses the original sample creation; edits are preserved and no duplicate is created. You can also choose the sample from the empty workspace.

After the initial build, `npm start` reopens the saved workspace. `npm run dev` runs the development server. Keep one Node process per local PGlite directory. Mefagram uses port 4747 so it does not collide with other development servers (Next.js and others default to 3000). If 4747 is occupied, start with `npm start -- --port 4800` and use that port in your MCP client configuration (including `.mcp.json` and `.codex/config.toml`).

Never bind the server to another interface (`--hostname 0.0.0.0`) or expose it through a tunnel or reverse proxy. Without accounts, anyone who reaches it can read and change every diagram.

## Configuration

`.env.example` lists the options. `MEFAGRAM_DATA_DIR` selects a durable local directory (default `.mefagram/db`); `DATABASE_URL` selects a Postgres database instead. Setup saves these in `.env.local`. Avoid changing storage targets in place: use a separate checkout for a new installation and deliberately export/import or migrate data.

## Updates

1. Stop the server.
2. Make the full backup below.
3. Pull the intended release, or fetch tags and check out a reviewed release tag.
4. Run `npm ci`, `npm run setup`, and `npm run build`.
5. Start the app and confirm diagrams, history and agent access.

Repeat setup never resets a workspace. Never use `git reset --hard` or `git clean -fdx` as an update recipe: private ignored data lives in this checkout. For rollback after a schema migration, restore the matching stopped-DB backup and previous source version together.

### Upgrading from 0.1.x (account-based releases)

0.2.0 removes sign-in, OAuth and personal access tokens. On first start or setup, existing diagrams, revision history and mutation receipts move to the single local owner. Setup removes the obsolete settings (`BETTER_AUTH_*`, `MEFAGRAM_SETUP_KEY`, `MEFAGRAM_OWNER_*`) from `.env.local` and deletes `.mefagram/local-access.json`, which only held the login password and agent token. Old account tables remain in the database but are no longer used. Reconnect agents with the token-free endpoint described in the [agent guide](agent-integration.md).

## Backup and restore

For local PGlite, stop the app and back up the **complete resolved `MEFAGRAM_DATA_DIR`** and `.env.local`. The default `.mefagram/db` is inside `.mefagram`; a custom path such as `/srv/mefagram-data` is separate and **must also be copied**. Keep the backup private.

To restore, stop the app, move the current data aside, and restore `.env.local` and the entire database directory. Start the matching release only after both are in place. Never overlay or copy an open PGlite database.

For Postgres, use database backup and restore tools. Browser JSON export/import transfers the current diagram's nodes, links, hierarchy, notes, sources and positions. It creates a new diagram and does not transfer revision history.
