import { z } from "zod";
import { DiagramError } from "./errors";
import { MAX_DIAGRAM_BYTES } from "./limits";

export const idSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/, "Geçersiz kimlik.");
export const tagSchema = z.string().trim().min(1).max(40);
export const sourceSchema = z
  .object({
    label: z.string().trim().min(1).max(160),
    url: z
      .url()
      .max(2048)
      .refine(
        (value) => ["https:", "http:"].includes(new URL(value).protocol),
        "Yalnızca http ve https bağlantıları kullanılabilir.",
      ),
  })
  .strict();
export const nodeSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1).max(120),
    kind: z
      .enum(["phase", "step", "decision", "note", "result"])
      .default("step"),
    description: z.string().max(12000).default(""),
    notes: z.string().max(50000).default(""),
    sources: z.array(sourceSchema).max(30).default([]),
    tags: z.array(tagSchema).max(20).default([]),
    parentId: idSchema.nullable().optional(),
    position: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export const edgeSchema = z
  .object({
    id: idSchema,
    source: idSchema,
    target: idSchema,
    label: z.string().max(160).default(""),
    kind: z.enum(["flow", "feedback", "reference"]).default("flow"),
  })
  .strict();
export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    nodes: z.array(nodeSchema).max(2000),
    edges: z.array(edgeSchema).max(6000),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = new Set<string>();
    for (const node of document.nodes) {
      if (ids.has(node.id))
        context.addIssue({
          code: "custom",
          message: `Tekrarlanan düğüm: ${node.id}`,
        });
      ids.add(node.id);
    }
    const byId = new Map(document.nodes.map((node) => [node.id, node]));
    for (const node of document.nodes) {
      const ancestors = new Set([node.id]);
      let parent = node.parentId;
      while (parent) {
        if (!byId.has(parent)) {
          context.addIssue({
            code: "custom",
            message: `Üst düğüm bulunamadı: ${parent}`,
          });
          break;
        }
        if (ancestors.has(parent)) {
          context.addIssue({
            code: "custom",
            message: "Düğüm hiyerarşisi döngü içeremez.",
          });
          break;
        }
        ancestors.add(parent);
        if (ancestors.size > 12) {
          context.addIssue({
            code: "custom",
            message: "Hiyerarşi en fazla 12 seviye olabilir.",
          });
          break;
        }
        parent = byId.get(parent)?.parentId;
      }
    }
    const edgeIds = new Set<string>();
    for (const edge of document.edges) {
      if (edgeIds.has(edge.id))
        context.addIssue({
          code: "custom",
          message: `Tekrarlanan bağlantı: ${edge.id}`,
        });
      edgeIds.add(edge.id);
      if (!ids.has(edge.source) || !ids.has(edge.target))
        context.addIssue({
          code: "custom",
          message: `Bağlantının düğümü bulunamadı: ${edge.id}`,
        });
    }
  });
export const metadataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(12000).default(""),
  tags: z.array(tagSchema).max(30).default([]),
});
// Patch schemas deliberately remove creation defaults. Zod applies defaults even
// inside partial objects, which would otherwise erase fields omitted by an agent.
export const metadataChangesSchema = metadataSchema
  .extend({
    description: metadataSchema.shape.description.removeDefault(),
    tags: metadataSchema.shape.tags.removeDefault(),
  })
  .partial();
export const nodeChangesSchema = nodeSchema
  .omit({ id: true })
  .extend({
    kind: nodeSchema.shape.kind.removeDefault(),
    description: nodeSchema.shape.description.removeDefault(),
    notes: nodeSchema.shape.notes.removeDefault(),
    sources: nodeSchema.shape.sources.removeDefault(),
    tags: nodeSchema.shape.tags.removeDefault(),
  })
  .partial();
export const edgeChangesSchema = edgeSchema
  .omit({ id: true })
  .extend({
    label: edgeSchema.shape.label.removeDefault(),
    kind: edgeSchema.shape.kind.removeDefault(),
  })
  .partial();
export const createDiagramSchema = metadataSchema
  .extend({ document: documentSchema })
  .strict();
export const exportSchema = z
  .object({
    format: z.literal("mefagram"),
    version: z.literal(1),
    source: z
      .object({ id: idSchema, revision: z.number().int().positive() })
      .strict(),
    diagram: createDiagramSchema,
  })
  .strict();

export type DiagramNode = z.infer<typeof nodeSchema>;
export type DiagramEdge = z.infer<typeof edgeSchema>;
export type DiagramDocument = z.infer<typeof documentSchema>;
export type DiagramContent = z.infer<typeof createDiagramSchema>;
export type DiagramExport = z.infer<typeof exportSchema>;
export interface DiagramRecord extends DiagramContent {
  id: string;
  revision: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface DiagramSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  revision: number;
  archived: boolean;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
}
export interface DiagramRevision {
  revision: number;
  createdAt: string;
  actor: string;
  summary: string;
}

export function validated<T extends z.ZodType>(
  schema: T,
  input: unknown,
  maximumBytes = MAX_DIAGRAM_BYTES,
): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new DiagramError(
      "VALIDATION_ERROR",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  if (
    new TextEncoder().encode(JSON.stringify(parsed.data)).length > maximumBytes
  )
    throw new DiagramError(
      "VALIDATION_ERROR",
      "Diyagram 2 MB sınırını aşıyor.",
    );
  return parsed.data;
}
