import { readFile } from "node:fs/promises";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

export async function connectAgent() {
  let access: { baseURL?: string; agentToken?: string } = {};
  try {
    access = JSON.parse(
      await readFile(
        process.env.MEFAGRAM_ACCESS_FILE ?? ".mefagram/local-access.json",
        "utf8",
      ),
    );
  } catch {
    /* Remote agents can use environment variables exclusively. */
  }
  const baseURL = (process.env.MEFAGRAM_URL ?? access.baseURL ?? "").replace(
    /\/$/,
    "",
  );
  const token = process.env.MEFAGRAM_AGENT_TOKEN ?? access.agentToken;
  if (!baseURL || !token)
    throw new Error(
      "Run npm run setup, or configure MEFAGRAM_URL and MEFAGRAM_AGENT_TOKEN.",
    );
  const url = new URL(baseURL);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Agent credentials require HTTPS except on localhost.");
  const client = new Client({ name: "mefagram-cli", version: "0.1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return { client, baseURL };
}
