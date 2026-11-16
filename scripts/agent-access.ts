import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

export async function connectAgent() {
  const baseURL = (process.env.MEFAGRAM_URL ?? "http://127.0.0.1:3000").replace(
    /\/$/,
    "",
  );
  const client = new Client({ name: "mefagram-cli", version: "0.2.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`)),
    );
  } catch {
    throw new Error(
      `Could not reach Mefagram at ${baseURL}. Start it with npm run dev (or set MEFAGRAM_URL).`,
    );
  }
  return { client, baseURL };
}
