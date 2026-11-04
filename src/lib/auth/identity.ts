import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import type { Database } from "@/lib/db";
import { DiagramError } from "@/lib/diagrams/errors";
import type { MefagramAuth } from "./server";
import {
  PersonalTokenService,
  type DiagramScope,
  type Identity,
} from "./tokens";

export async function resolveIdentity(
  request: Request,
  auth: MefagramAuth,
  database: Database,
  requiredScope: DiagramScope,
  baseURL: string,
  allowSession = true,
): Promise<Identity> {
  let identity: Identity | null = null;
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
    if (!token)
      throw new DiagramError("UNAUTHORIZED", "Geçersiz erişim anahtarı.", 401);
    if (token.startsWith("mfg_")) {
      identity = await new PersonalTokenService(database).verify(token);
    } else {
      try {
        const client = createAuthClient({
          baseURL,
          plugins: [oauthProviderResourceClient(auth)],
        });
        const payload = await client.verifyAccessTokenRequest(request, {
          verifyOptions: { audience: `${baseURL}/api/mcp` },
        });
        const owner = await database.query(
          'SELECT id FROM "user" WHERE id = $1',
          [payload.sub ?? ""],
        );
        if (owner.rows.length)
          identity = {
            userId: String(payload.sub),
            actor: "mcp",
            scopes: String(payload.scope ?? "")
              .split(" ")
              .filter(
                (scope): scope is DiagramScope =>
                  scope === "diagrams:read" || scope === "diagrams:write",
              ),
          };
      } catch {
        throw new DiagramError(
          "UNAUTHORIZED",
          "Agent bağlantısının süresi dolmuş veya bağlantı geçersiz.",
          401,
        );
      }
    }
  } else if (allowSession) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session) {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        request.headers.get("origin") !== new URL(baseURL).origin
      )
        throw new DiagramError(
          "FORBIDDEN",
          "İstek bu çalışma alanından gelmelidir.",
          403,
        );
      identity = {
        userId: session.user.id,
        actor: "web",
        scopes: ["diagrams:read", "diagrams:write"],
      };
    }
  }
  if (!identity)
    throw new DiagramError(
      "UNAUTHORIZED",
      "Bu çalışma alanına erişmek için oturum açın.",
      401,
    );
  if (!identity.scopes.includes(requiredScope))
    throw new DiagramError(
      "INSUFFICIENT_SCOPE",
      "Bu bağlantıya düzenleme izni verilmemiş.",
      403,
    );
  return identity;
}
