import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/lib/db";
import { DiagramError } from "./errors";
import { DiagramRepository } from "./repository";
import { idSchema, validated } from "./schema";
import { publish } from "@/lib/http/events";

// Comments are the developer's channel back to the agent (and the agent's way
// to ask a question). They are not part of the diagram content or revisions.

export type CommentAuthor = "developer" | "agent";
export interface DiagramComment {
  id: string;
  diagramId: string;
  diagramTitle: string;
  nodeId: string | null;
  nodeLabel: string | null;
  author: CommentAuthor;
  body: string;
  status: "open" | "resolved";
  reply: string;
  createdAt: string;
  resolvedAt: string | null;
}

export const commentInputSchema = z
  .object({
    nodeId: idSchema.nullable().optional(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();
export const resolveInputSchema = z
  .object({ reply: z.string().trim().max(4000).optional() })
  .strict();

const iso = (value: unknown) =>
  value ? new Date(value as string).toISOString() : null;

function announce(comment: DiagramComment) {
  publish({ type: "comments", diagramId: comment.diagramId });
  return comment;
}

export class CommentService {
  private readonly repository: DiagramRepository;
  constructor(private readonly database: Database) {
    this.repository = new DiagramRepository(database);
  }

  async add(
    ownerId: string,
    diagramId: string,
    author: CommentAuthor,
    input: unknown,
  ) {
    const request = validated(commentInputSchema, input);
    const diagram = await this.repository.get(
      ownerId,
      validated(idSchema, diagramId),
    );
    if (
      request.nodeId &&
      !diagram.document.nodes.some((node) => node.id === request.nodeId)
    )
      throw new DiagramError(
        "VALIDATION_ERROR",
        `Node not found: ${request.nodeId}`,
      );
    const id = randomUUID();
    await this.database.query(
      `INSERT INTO diagram_comments (id, owner_id, diagram_id, node_id, author, body)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, ownerId, diagram.id, request.nodeId ?? null, author, request.body],
    );
    return announce((await this.list(ownerId, { id }))[0]);
  }

  async list(
    ownerId: string,
    options: {
      id?: string;
      diagramId?: string;
      project?: string;
      status?: "open" | "resolved" | "all";
      author?: CommentAuthor;
      /** Only what needs the agent: developer comments and answered questions. */
      forAgent?: boolean;
    } = {},
  ): Promise<DiagramComment[]> {
    const result = await this.database.query(
      `SELECT c.*, d.title AS diagram_title, d.document AS document
      FROM diagram_comments c JOIN diagrams d ON d.id = c.diagram_id
      WHERE c.owner_id = $1
      AND ($2::text IS NULL OR c.id = $2)
      AND ($3::text IS NULL OR c.diagram_id = $3)
      AND ($4::text IS NULL OR d.project = $4)
      AND ($5::text = 'all' OR c.status = $5)
      AND ($6::text IS NULL OR c.author = $6)
      AND (NOT $7::boolean OR c.author = 'developer' OR c.reply <> '')
      ORDER BY c.created_at, c.id LIMIT 500`,
      [
        ownerId,
        options.id ?? null,
        options.diagramId ?? null,
        options.project ?? null,
        options.id ? "all" : (options.status ?? "open"),
        options.author ?? null,
        Boolean(options.forAgent),
      ],
    );
    return result.rows.map((row) => {
      const nodes = (row.document as { nodes: { id: string; label: string }[] })
        .nodes;
      return {
        id: row.id as string,
        diagramId: row.diagram_id as string,
        diagramTitle: row.diagram_title as string,
        nodeId: (row.node_id as string) ?? null,
        nodeLabel: row.node_id
          ? (nodes.find((node) => node.id === row.node_id)?.label ?? null)
          : null,
        author: row.author as CommentAuthor,
        body: row.body as string,
        status: row.status as "open" | "resolved",
        reply: row.reply as string,
        createdAt: iso(row.created_at)!,
        resolvedAt: iso(row.resolved_at),
      };
    });
  }

  async resolve(ownerId: string, id: string, input: unknown = {}) {
    const request = validated(resolveInputSchema, input);
    const result = await this.database.query(
      `UPDATE diagram_comments SET status = 'resolved', resolved_at = NOW(),
      reply = COALESCE($3, reply) WHERE owner_id = $1 AND id = $2 RETURNING id`,
      [ownerId, validated(z.uuid(), id), request.reply ?? null],
    );
    if (!result.rows.length)
      throw new DiagramError("NOT_FOUND", "Comment not found.", 404);
    return announce((await this.list(ownerId, { id }))[0]);
  }

  /** The developer answers an agent's question; the agent resolves it later. */
  async answer(ownerId: string, id: string, input: unknown) {
    const request = validated(
      z.object({ reply: z.string().trim().min(1).max(4000) }).strict(),
      input,
    );
    const result = await this.database.query(
      `UPDATE diagram_comments SET reply = $3
      WHERE owner_id = $1 AND id = $2 AND author = 'agent' AND status = 'open' RETURNING id`,
      [ownerId, validated(z.uuid(), id), request.reply],
    );
    if (!result.rows.length)
      throw new DiagramError("NOT_FOUND", "Open agent question not found.", 404);
    return announce((await this.list(ownerId, { id }))[0]);
  }

  async reopen(ownerId: string, id: string) {
    const result = await this.database.query(
      `UPDATE diagram_comments SET status = 'open', resolved_at = NULL
      WHERE owner_id = $1 AND id = $2 RETURNING id`,
      [ownerId, validated(z.uuid(), id)],
    );
    if (!result.rows.length)
      throw new DiagramError("NOT_FOUND", "Comment not found.", 404);
    return announce((await this.list(ownerId, { id }))[0]);
  }
}
