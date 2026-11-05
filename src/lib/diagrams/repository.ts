import type { Database, SqlExecutor } from "@/lib/db";
import { DiagramError } from "./errors";
import type {
  DiagramContent,
  DiagramRecord,
  DiagramRevision,
  DiagramSummary,
} from "./schema";

type Row = Record<string, unknown>;
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
export function recordFromRow(row: Row): DiagramRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    tags: row.tags as string[],
    document: row.document as DiagramContent["document"],
    revision: Number(row.revision),
    archived: Boolean(row.archived),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
export function recordContent(record: DiagramRecord) {
  return {
    title: record.title,
    description: record.description,
    tags: record.tags,
    document: record.document,
    archived: record.archived,
  };
}

export class DiagramRepository {
  constructor(private readonly database: Database) {}

  async list(
    ownerId: string,
    options: { search?: string; archived?: boolean; limit?: number },
  ) {
    const query = options.search?.trim() ?? "";
    const result = await this.database.query(
      `SELECT id, title, description, tags, revision, archived, updated_at,
      jsonb_array_length(document->'nodes') AS node_count, jsonb_array_length(document->'edges') AS edge_count
      FROM diagrams WHERE owner_id = $1 AND archived = $2
      AND ($3 = '' OR STRPOS(LOWER(title || ' ' || description || ' ' || tags::text || ' ' || document::text), LOWER($3)) > 0)
      ORDER BY updated_at DESC, id LIMIT $4`,
      [
        ownerId,
        Boolean(options.archived),
        query,
        Math.max(1, Math.min(500, options.limit ?? 200)),
      ],
    );
    return result.rows.map(
      (row) =>
        ({
          id: row.id as string,
          title: row.title as string,
          description: row.description as string,
          tags: row.tags as string[],
          revision: Number(row.revision),
          archived: Boolean(row.archived),
          updatedAt: iso(row.updated_at),
          nodeCount: Number(row.node_count),
          edgeCount: Number(row.edge_count),
        }) satisfies DiagramSummary,
    );
  }

  async get(
    ownerId: string,
    id: string,
    executor: SqlExecutor = this.database,
  ) {
    const result = await executor.query(
      "SELECT * FROM diagrams WHERE owner_id = $1 AND id = $2",
      [ownerId, id],
    );
    if (!result.rows[0])
      throw new DiagramError("NOT_FOUND", "Diagram not found.", 404);
    return recordFromRow(result.rows[0]);
  }

  async insert(
    transaction: SqlExecutor,
    ownerId: string,
    id: string,
    content: DiagramContent,
  ) {
    const result = await transaction.query(
      `INSERT INTO diagrams (id, owner_id, title, description, tags, document)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING *`,
      [
        id,
        ownerId,
        content.title,
        content.description,
        JSON.stringify(content.tags),
        JSON.stringify(content.document),
      ],
    );
    return recordFromRow(result.rows[0]);
  }

  async update(
    transaction: SqlExecutor,
    ownerId: string,
    id: string,
    expectedRevision: number,
    content: DiagramContent & { archived: boolean },
  ) {
    const result = await transaction.query(
      `UPDATE diagrams SET title = $1, description = $2, tags = $3::jsonb,
      document = $4::jsonb, archived = $5, revision = revision + 1, updated_at = NOW()
      WHERE owner_id = $6 AND id = $7 AND revision = $8 RETURNING *`,
      [
        content.title,
        content.description,
        JSON.stringify(content.tags),
        JSON.stringify(content.document),
        content.archived,
        ownerId,
        id,
        expectedRevision,
      ],
    );
    if (!result.rows[0]) {
      await this.get(ownerId, id, transaction);
      throw new DiagramError(
        "REVISION_CONFLICT",
        "This diagram was updated elsewhere. Open the latest revision and reapply your change.",
        409,
      );
    }
    return recordFromRow(result.rows[0]);
  }

  async appendRevision(
    transaction: SqlExecutor,
    record: DiagramRecord,
    actor: string,
    summary: string,
  ) {
    await transaction.query(
      `INSERT INTO diagram_revisions (diagram_id, revision, content, actor, summary)
      VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [
        record.id,
        record.revision,
        JSON.stringify(recordContent(record)),
        actor,
        summary,
      ],
    );
  }

  async revisions(ownerId: string, id: string): Promise<DiagramRevision[]> {
    await this.get(ownerId, id);
    const result = await this.database.query(
      `SELECT r.revision, r.created_at, r.actor, r.summary FROM diagram_revisions r
      JOIN diagrams d ON d.id = r.diagram_id WHERE d.owner_id = $1 AND d.id = $2 ORDER BY r.revision DESC`,
      [ownerId, id],
    );
    return result.rows.map((row) => ({
      revision: Number(row.revision),
      createdAt: iso(row.created_at),
      actor: row.actor as string,
      summary: row.summary as string,
    }));
  }

  async revisionContent(
    transaction: SqlExecutor,
    ownerId: string,
    id: string,
    revision: number,
  ) {
    const result = await transaction.query(
      `SELECT r.content FROM diagram_revisions r JOIN diagrams d ON d.id = r.diagram_id
      WHERE d.owner_id = $1 AND d.id = $2 AND r.revision = $3`,
      [ownerId, id, revision],
    );
    if (!result.rows[0])
      throw new DiagramError("NOT_FOUND", "The requested revision was not found.", 404);
    return result.rows[0].content as DiagramContent & { archived: boolean };
  }
}
