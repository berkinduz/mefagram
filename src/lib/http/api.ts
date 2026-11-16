import { z } from "zod";
import type { Database } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { DiagramError } from "@/lib/diagrams/errors";
import { DiagramService } from "@/lib/diagrams/service";
import { validated } from "@/lib/diagrams/schema";
import { operationsSchema } from "@/lib/diagrams/patch";
import { newsletterTemplate } from "@/lib/diagrams/seed";
import { forbiddenResponse, rejectNonLocal } from "./local";
import { errorResponse, json, readJson } from "./response";

export interface ApiContext {
  database: Database;
}
const updateRequest = z
  .object({
    expectedRevision: z.number().int().positive(),
    operations: operationsSchema,
  })
  .strict();
const restoreRequest = z
  .object({
    expectedRevision: z.number().int().positive(),
    revision: z.number().int().positive(),
  })
  .strict();

export function createApiHandler(context: ApiContext) {
  return async (request: Request): Promise<Response> => {
    const rejected = rejectNonLocal(request.headers);
    if (rejected) return forbiddenResponse(rejected);
    try {
      const identity = { userId: LOCAL_OWNER };
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, "");
      const service = new DiagramService(context.database, "web");
      const mutationId = () => {
        const key = request.headers.get("idempotency-key");
        if (!key || key.length > 128)
          throw new DiagramError(
            "VALIDATION_ERROR",
            "The Idempotency-Key header is required (up to 128 characters).",
          );
        return key;
      };
      if (path === "/api/status" && request.method === "GET")
        return json({
          storage: context.database.mode,
          mcpUrl: `${url.origin}/api/mcp`,
        });
      if (path === "/api/diagrams") {
        if (request.method === "GET")
          return json(
            await service.list(identity.userId, {
              search: url.searchParams.get("search") ?? "",
              archived: url.searchParams.get("archived") === "true",
            }),
          );
        if (request.method === "POST")
          return json(
            await service.create(
              identity.userId,
              await readJson(request),
              mutationId(),
            ),
            201,
          );
      }
      if (path === "/api/diagrams/import" && request.method === "POST")
        return json(
          await service.import(
            identity.userId,
            await readJson(request),
            mutationId(),
          ),
          201,
        );
      if (
        ["/api/templates/newsletter", "/api/templates/mefa-apps"].includes(
          path,
        ) &&
        request.method === "POST"
      )
        return json(
          await service.createTemplate(
            identity.userId,
            newsletterTemplate(),
            mutationId(),
            path === "/api/templates/mefa-apps",
          ),
          201,
        );
      const match =
        /^\/api\/diagrams\/([^/]+)(?:\/(history|export|restore))?$/.exec(path);
      if (match) {
        const [, id, action] = match;
        if (!action && request.method === "GET")
          return json(await service.get(identity.userId, id));
        if (!action && request.method === "PATCH") {
          const body = validated(updateRequest, await readJson(request));
          return json(
            await service.patch(
              identity.userId,
              id,
              body.expectedRevision,
              body.operations,
              mutationId(),
            ),
          );
        }
        if (action === "history" && request.method === "GET")
          return json(await service.revisions(identity.userId, id));
        if (
          action === "export" &&
          request.method === "GET" &&
          url.searchParams.get("format") === "mermaid"
        )
          return new Response(await service.mermaid(identity.userId, id), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "private, no-store",
            },
          });
        if (action === "export" && request.method === "GET")
          return json(await service.export(identity.userId, id), 200, {
            "Content-Disposition": `attachment; filename="mefagram-${id}.json"`,
          });
        if (action === "restore" && request.method === "POST") {
          const body = validated(restoreRequest, await readJson(request));
          return json(
            await service.restore(
              identity.userId,
              id,
              body.revision,
              body.expectedRevision,
              mutationId(),
            ),
          );
        }
      }
      throw new DiagramError("NOT_FOUND", "The requested action was not found.", 404);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
