import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { getAuth } from "./server";
import { authConfig } from "./config";

export async function authorizationServerMetadata(request: Request) {
  return oauthProviderAuthServerMetadata(await getAuth())(request);
}
export async function openIdMetadata(request: Request) {
  return oauthProviderOpenIdConfigMetadata(await getAuth())(request);
}
export function protectedResourceMetadata() {
  const { baseURL } = authConfig();
  return Response.json(
    {
      resource: `${baseURL}/api/mcp`,
      authorization_servers: [`${baseURL}/api/auth`],
      scopes_supported: ["diagrams:read", "diagrams:write"],
      bearer_methods_supported: ["header"],
      resource_name: "Mefagram",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
