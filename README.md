# Mefagram

**Your AI agent draws the map. You explore it, and talk back.**

Long chats with Claude or Codex produce great plans, then scroll away. Mefagram gives your agent a place to save them as living diagrams: workflows, project plans, research maps and maps of your codebase. You open them in the browser, comment on any step, and the agent picks your comments up and updates the map.

![A workflow map in Mefagram: six phases with connections, one with an open comment for the agent](docs/images/overview.png)

- **Ask, don't draw.** Describe a process in chat. Your agent builds the diagram (from Mermaid, which it already writes fluently) with phases, decisions, notes and links.
- **Talk back.** Comment on a node ("split this step", "what about refunds?"). The agent reads it with `get_feedback`, changes the map and replies. It can ask you questions the same way.
- **Watch it happen.** Changes appear live as the agent saves them, and the nodes it touched light up.
- **Jump to the code.** Codebase maps link each step to its file and line, opening in VS Code, Cursor, Windsurf or Zed.
- **Take it anywhere.** Export Mermaid for pull requests, a standalone SVG for docs, or lossless JSON you can commit next to your code.
- **Yours, on your machine.** No account, no API key, no cloud. One local workspace shared by all your agents.

## Get started

You need **Node.js 24+**.

**Claude Code**: install the plugin (MCP server plus skills to map processes, map your codebase and handle your comments):

```text
/plugin marketplace add berkinduz/mefagram
/plugin install mefagram@mefagram
```

**Codex** (CLI, IDE extension and the ChatGPT app share this):

```sh
codex mcp add mefagram -- npx -y mefagram mcp
```

**Any other MCP client**: run `npx -y mefagram mcp` as a stdio server.

The agent starts the workspace on demand. Open it yourself with `npx mefagram open`, or go to [127.0.0.1:4747](http://127.0.0.1:4747).

<details>
<summary>Run from source</summary>

```sh
git clone https://github.com/berkinduz/mefagram.git
cd mefagram
npm ci
npm run setup -- --example newsletter
npm run build
npm start
```

Then connect with `node /path/to/mefagram/bin/mefagram.mjs mcp`, or over HTTP at `http://127.0.0.1:4747/api/mcp`. Inside the repository, Claude Code and Codex pick up the bundled `.mcp.json` and `.codex/config.toml`.

</details>

## Things to ask

- “Map how a request flows through this repo, with links to the code.”
- “Turn this conversation into a project plan in Mefagram, grouped into phases.”
- “I left comments on the onboarding map. Handle them.”
- “Expand the step I'm looking at.”

## Good to know

- Mefagram only accepts requests from this computer, which is why it needs no login. Don't expose the port to a network or tunnel.
- Data lives in `~/.mefagram` (or `.mefagram/` in a source checkout). Stop the app and copy that folder to back it up.
- `npx mefagram export docs/diagrams --project my-repo` writes every diagram of a project as `.mefagram.json`, `.mmd` and `.svg`.

[Agent guide](docs/agent-integration.md) · [Install, update & backup](docs/installation.md) · [Contribute](CONTRIBUTING.md) · MIT licensed
