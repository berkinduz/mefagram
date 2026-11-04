import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, SqlExecutor } from "@/lib/db";
import { DiagramError } from "./errors";
import { MAX_TRANSFER_BYTES } from "./limits";
import { applyPatch, operationsSchema } from "./patch";
import { DiagramRepository, recordContent } from "./repository";
import {
  createDiagramSchema,
  exportSchema,
  idSchema,
  validated,
  type DiagramExport,
  type DiagramRecord,
} from "./schema";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

export class DiagramService {
  private readonly repository: DiagramRepository;
  constructor(
    private readonly database: Database,
    private readonly actor = "web",
  ) {
    this.repository = new DiagramRepository(database);
  }

  list(
    ownerId: string,
    options: { search?: string; archived?: boolean; limit?: number } = {},
  ) {
    return this.repository.list(ownerId, options);
  }
  get(ownerId: string, id: string) {
    return this.repository.get(ownerId, validated(idSchema, id));
  }
  revisions(ownerId: string, id: string) {
    return this.repository.revisions(ownerId, validated(idSchema, id));
  }

  async create(ownerId: string, input: unknown, mutationId: string) {
    const content = validated(createDiagramSchema, input);
    return this.mutate(
      ownerId,
      mutationId,
      { action: "create", content },
      async (transaction) => {
        const saved = await this.repository.insert(
          transaction,
          ownerId,
          randomUUID(),
          content,
        );
        await this.repository.appendRevision(
          transaction,
          saved,
          this.actor,
          "Diyagram oluşturuldu",
        );
        return saved;
      },
    );
  }

  async patch(
    ownerId: string,
    id: string,
    expectedRevision: number,
    input: unknown,
    mutationId: string,
  ) {
    validated(idSchema, id);
    validated(z.number().int().positive(), expectedRevision);
    const operations = validated(operationsSchema, input);
    return this.mutate(
      ownerId,
      mutationId,
      { action: "patch", id, expectedRevision, operations },
      async (transaction) => {
        const current = await this.repository.get(ownerId, id, transaction);
        if (current.revision !== expectedRevision)
          throw new DiagramError(
            "REVISION_CONFLICT",
            "Diyagramın daha yeni bir sürümü var. Önce son sürümü açın.",
            409,
          );
        const next = applyPatch(recordContent(current), operations);
        const saved = await this.repository.update(
          transaction,
          ownerId,
          id,
          expectedRevision,
          next,
        );
        const summary =
          operations.length === 1
            ? {
                update_metadata: "Diyagram bilgileri güncellendi",
                add_node: "Düğüm eklendi",
                update_node: "Düğüm güncellendi",
                remove_node: "Düğüm silindi",
                add_edge: "Bağlantı eklendi",
                update_edge: "Bağlantı güncellendi",
                remove_edge: "Bağlantı silindi",
              }[operations[0].op]
            : `${operations.length} değişiklik uygulandı`;
        await this.repository.appendRevision(
          transaction,
          saved,
          this.actor,
          summary,
        );
        return saved;
      },
    );
  }

  async restore(
    ownerId: string,
    id: string,
    revision: number,
    expectedRevision: number,
    mutationId: string,
  ) {
    validated(idSchema, id);
    validated(z.number().int().positive(), revision);
    validated(z.number().int().positive(), expectedRevision);
    return this.mutate(
      ownerId,
      mutationId,
      { action: "restore", id, revision, expectedRevision },
      async (transaction) => {
        const content = await this.repository.revisionContent(
          transaction,
          ownerId,
          id,
          revision,
        );
        const saved = await this.repository.update(
          transaction,
          ownerId,
          id,
          expectedRevision,
          content,
        );
        await this.repository.appendRevision(
          transaction,
          saved,
          this.actor,
          `Sürüm ${revision} geri yüklendi`,
        );
        return saved;
      },
    );
  }

  async export(ownerId: string, id: string): Promise<DiagramExport> {
    const record = await this.get(ownerId, id);
    return {
      format: "mefagram",
      version: 1,
      source: { id: record.id, revision: record.revision },
      diagram: {
        title: record.title,
        description: record.description,
        tags: record.tags,
        document: record.document,
      },
    };
  }

  async import(ownerId: string, input: unknown, mutationId: string) {
    const content = validated(exportSchema, input, MAX_TRANSFER_BYTES);
    return this.create(ownerId, content.diagram, mutationId);
  }

  private async mutate(
    ownerId: string,
    mutationId: string,
    request: unknown,
    operation: (transaction: SqlExecutor) => Promise<DiagramRecord>,
  ): Promise<DiagramRecord> {
    validated(z.string().min(1).max(128), mutationId);
    if (!ownerId) throw new DiagramError("UNAUTHORIZED", "Oturum açın.", 401);
    const hash = createHash("sha256").update(canonical(request)).digest("hex");
    return this.database.transaction(async (transaction) => {
      const reservation = await transaction.query(
        `INSERT INTO diagram_mutations (owner_id, mutation_key, request_hash)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING mutation_key`,
        [ownerId, mutationId, hash],
      );
      if (!reservation.rows.length) {
        const result = await transaction.query(
          "SELECT request_hash, result FROM diagram_mutations WHERE owner_id = $1 AND mutation_key = $2",
          [ownerId, mutationId],
        );
        if (result.rows[0]?.request_hash !== hash)
          throw new DiagramError(
            "IDEMPOTENCY_CONFLICT",
            "Bu işlem kimliği başka bir istek için kullanılmış.",
            409,
          );
        if (!result.rows[0]?.result)
          throw new DiagramError(
            "MUTATION_PENDING",
            "İşlem henüz tamamlanmadı. Aynı kimlikle yeniden deneyin.",
            409,
          );
        return result.rows[0].result as DiagramRecord;
      }
      const saved = await operation(transaction);
      await transaction.query(
        "UPDATE diagram_mutations SET result = $1::jsonb WHERE owner_id = $2 AND mutation_key = $3",
        [JSON.stringify(saved), ownerId, mutationId],
      );
      return saved;
    });
  }
}
