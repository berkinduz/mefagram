# Mefagram — Diagrams your agents can edit

Turn conversations into workflows, project plans and research maps that stay useful after the chat ends.

Mefagram is a **local diagram workspace and MCP server for AI agents**. Your agents build and update the map; you explore it in the browser.

- **Explore:** zoom, pan, expand stages, and inspect notes and sources.
- **Keep context:** search saved diagrams and revisit their revision history.
- **Work across agents:** share one workspace, with conflict detection and JSON import/export.

## Get started

Requires **Node.js 24+**.

```sh
git clone https://github.com/berkinduz/mefagram.git
cd mefagram
npm ci
npm run setup -- --example newsletter
npm run build
npm start
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). There is no login: Mefagram only accepts requests addressed to this computer. Omit `--example newsletter` for an empty workspace.

## Connect Claude

MCP endpoint: `http://127.0.0.1:3000/api/mcp` (Streamable HTTP, no credentials).

Inside this repository, Claude Code picks up the bundled `.mcp.json` and asks once to enable the `mefagram` server. To use it from every project:

```sh
claude mcp add --transport http --scope user mefagram http://127.0.0.1:3000/api/mcp
```

Agents with terminal access can also use the included MCP client:

```sh
npm run agent -- list
npm run agent -- tools
```

Try asking: **“Map our onboarding process, including handoffs, decisions and source links.”**

The app must be running for agents to connect. Data persists on disk in `.mefagram/`. See the [agent guide](docs/agent-integration.md) for tools and update examples.

[Install & backup](docs/installation.md) · [Contribute](CONTRIBUTING.md)
