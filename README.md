# Mefagram

**Your AI agent draws the map. You explore it.**

Long chats with Claude or Codex produce great plans, then scroll away. Mefagram gives your agent a place to save them as living diagrams: workflows, project plans and research maps that you can open in the browser, come back to next week, and ask the agent to update.

![A workflow map in Mefagram: six phases with connections, each opening into its own steps](docs/images/overview.png)

- **Ask, don't draw.** Describe a process in chat. Your agent builds the diagram with phases, steps, decisions, notes and source links.
- **Read big ideas calmly.** Start from a handful of phases, then open each one for its details. Switch between a map and a plain list.
- **Keep it current.** Ask "add the review step we discussed" and the agent edits the existing map, never a fresh copy. Every change is a revision you can restore.
- **Yours, on your machine.** No account, no API key, no cloud. Diagrams live in a local database; export any of them as JSON.

## Get started

You need **Node.js 24+**.

```sh
git clone https://github.com/berkinduz/mefagram.git
cd mefagram
npm ci
npm run setup -- --example newsletter
npm run build
npm start
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). The example is a small fictional newsletter workflow; leave out `--example newsletter` to start empty.

## Connect your agent

Mefagram speaks [MCP](https://modelcontextprotocol.io). Keep the app running, then register it once:

**Claude Code**

```sh
claude mcp add --transport http --scope user mefagram http://127.0.0.1:3000/api/mcp
```

**Codex** (CLI, IDE extension and the ChatGPT app share this)

```sh
codex mcp add mefagram --url http://127.0.0.1:3000/api/mcp
```

Working inside this repository? Claude Code and Codex pick up the bundled `.mcp.json` and `.codex/config.toml` automatically after you approve or trust the project. The in-app **Agent connections** panel has these commands ready to copy.

## Things to ask

- “Map our customer onboarding, including handoffs, decisions and links to the docs.”
- “Turn this conversation into a project plan in Mefagram, grouped into phases.”
- “Open the onboarding map and add the security review we just talked about.”
- “Make a research map of these five papers and how they relate.”

## Good to know

- Mefagram only accepts requests from this computer, which is why it needs no login. Don't expose the port to a network or tunnel.
- Everything is stored in `.mefagram/`. Stop the app and copy that folder to back it up.
- Several agents can work on the same workspace; if two edit the same diagram at once, the second one is asked to reread instead of overwriting.

[Agent guide](docs/agent-integration.md) · [Install, update & backup](docs/installation.md) · [Contribute](CONTRIBUTING.md) · MIT licensed
