# Mefagram — Diagrams your agents can edit

Turn conversations into workflows, project plans and research maps that stay useful after the chat ends.

Mefagram is a **self-hosted diagram workspace and MCP server for AI agents**. Your agents build and update the map; you explore it in the browser.

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

Open [localhost:3000](http://127.0.0.1:3000). Login credentials are in `.mefagram/local-access.json`. Omit `--example newsletter` for an empty workspace.

## Connect your agent

MCP endpoint: `http://127.0.0.1:3000/api/mcp`. Authenticate with OAuth or a scoped token. No model API key is required.

Agents with terminal access can use the included MCP client:

```sh
npm run agent -- list
npm run agent -- tools
```

Try asking: **“Map our onboarding process, including handoffs, decisions and source links.”**

Local data persists on disk. Remote agents need a reachable HTTPS installation. See the [agent guide](docs/agent-integration.md) for tools, authentication and update examples.

[Install & backup](docs/installation.md) · [Hosting](docs/deployment.md) · [Contribute](CONTRIBUTING.md) · [Türkçe](docs/README.tr.md)

The interface is currently Turkish; diagrams can use any language.
