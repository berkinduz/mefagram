import { timingSafeEqual } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Database } from "@/lib/db";
import { getDatabase } from "@/lib/db";
import * as schema from "@/lib/db/auth-schema";
import { authPlugins } from "./plugins";
import { authConfig, type AuthConfig } from "./config";

export function createAuth(database: Database, config: AuthConfig) {
  return betterAuth({
    appName: "Mefagram",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    database: drizzleAdapter(
      database.authDb as Parameters<typeof drizzleAdapter>[0],
      { provider: "pg", schema },
    ),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    trustedOrigins: [config.baseURL],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/oauth2/register": { window: 60, max: 10 },
      },
    },
    plugins: authPlugins(config.baseURL),
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/sign-up/email") return;
        const candidate = context.headers?.get("x-mefagram-setup-key") ?? "";
        const valid =
          candidate.length === config.setupKey.length &&
          timingSafeEqual(Buffer.from(candidate), Buffer.from(config.setupKey));
        if (
          !valid ||
          String(context.body?.email ?? "").toLowerCase() !== config.ownerEmail
        )
          throw new APIError("FORBIDDEN", {
            message: "Account registration is disabled.",
          });
        const existing = await database.query('SELECT id FROM "user" LIMIT 1');
        if (existing.rows.length)
          throw new APIError("FORBIDDEN", {
            message: "The workspace owner already exists.",
          });
      }),
    },
  });
}

export type MefagramAuth = ReturnType<typeof createAuth>;
const globalAuth = globalThis as typeof globalThis & {
  mefagramAuth?: Promise<MefagramAuth>;
};
export function getAuth() {
  if (!globalAuth.mefagramAuth) {
    globalAuth.mefagramAuth = getDatabase().then((database) =>
      createAuth(database, authConfig()),
    );
    globalAuth.mefagramAuth.catch(() => {
      globalAuth.mefagramAuth = undefined;
    });
  }
  return globalAuth.mefagramAuth;
}
