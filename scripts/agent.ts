import { readFile } from "node:fs/promises";
import { connectAgent } from "./agent-access";

const [command, argument, file] = process.argv.slice(2);
if (!command || command === "--help") {
  console.log(
    `Mefagram agent CLI (uses the authenticated MCP endpoint)\n\n  npm run agent -- tools\n  npm run agent -- list [search]\n  npm run agent -- get <diagram-id>\n  npm run agent -- history <diagram-id>\n  npm run agent -- export <diagram-id>\n  npm run agent -- call <tool-name> <arguments.json>\n\nCredentials: MEFAGRAM_URL + MEFAGRAM_AGENT_TOKEN, or a private MEFAGRAM_ACCESS_FILE.\nThe default access file is .mefagram/local-access.json. Never commit it.`,
  );
  process.exit(0);
}
let connection: Awaited<ReturnType<typeof connectAgent>> | undefined;
try {
  const supported = ["tools", "list", "get", "history", "export", "call"];
  if (!supported.includes(command))
    throw new Error("Unknown command. Run npm run agent -- --help.");
  if (["get", "history", "export"].includes(command) && !argument)
    throw new Error("A diagram ID is required.");
  if (command === "call" && (!argument || !file))
    throw new Error("Supply the tool name and a JSON arguments file.");
  connection = await connectAgent();
  if (command === "tools")
    console.log(JSON.stringify(await connection.client.listTools(), null, 2));
  else {
    const name =
      command === "call"
        ? argument!
        : {
            list: "list_diagrams",
            get: "get_diagram",
            history: "get_diagram_history",
            export: "export_diagram",
          }[command]!;
    const args =
      command === "call"
        ? JSON.parse(await readFile(file, "utf8"))
        : command === "list"
          ? { search: argument ?? "" }
          : { id: argument };
    const result = await connection.client.callTool({ name, arguments: args });
    console.log(
      JSON.stringify(result.structuredContent ?? result.content, null, 2),
    );
    if (result.isError) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Agent request failed.",
  );
  process.exitCode = 1;
} finally {
  await connection?.client.close();
}
