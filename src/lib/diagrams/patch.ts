import { z } from "zod";
import { DiagramError } from "./errors";
import {
  createDiagramSchema,
  edgeChangesSchema,
  edgeSchema,
  idSchema,
  metadataChangesSchema,
  nodeChangesSchema,
  nodeSchema,
  validated,
  type DiagramContent,
} from "./schema";

export const operationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("update_metadata"),
      changes: metadataChangesSchema
        .extend({ archived: z.boolean().optional() })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal("add_node"), node: nodeSchema }).strict(),
  z
    .object({
      op: z.literal("update_node"),
      id: idSchema,
      changes: nodeChangesSchema.strict(),
    })
    .strict(),
  z
    .object({
      op: z.literal("remove_node"),
      id: idSchema,
      cascade: z.boolean().default(false),
    })
    .strict(),
  z.object({ op: z.literal("add_edge"), edge: edgeSchema }).strict(),
  z
    .object({
      op: z.literal("update_edge"),
      id: idSchema,
      changes: edgeChangesSchema.strict(),
    })
    .strict(),
  z.object({ op: z.literal("remove_edge"), id: idSchema }).strict(),
]);
export const operationsSchema = z.array(operationSchema).min(1).max(500);
export type DiagramOperation = z.infer<typeof operationSchema>;

export function applyPatch(
  content: DiagramContent & { archived: boolean },
  input: unknown,
) {
  const operations = validated(operationsSchema, input);
  const next = structuredClone(content);
  for (const operation of operations) {
    switch (operation.op) {
      case "update_metadata":
        Object.assign(next, operation.changes);
        break;
      case "add_node":
        if (next.document.nodes.some((node) => node.id === operation.node.id))
          throw new DiagramError(
            "VALIDATION_ERROR",
            `Düğüm zaten var: ${operation.node.id}`,
          );
        next.document.nodes.push(operation.node);
        break;
      case "update_node": {
        const node = next.document.nodes.find(
          (item) => item.id === operation.id,
        );
        if (!node)
          throw new DiagramError(
            "VALIDATION_ERROR",
            `Düğüm bulunamadı: ${operation.id}`,
          );
        Object.assign(node, operation.changes);
        break;
      }
      case "remove_node": {
        if (!next.document.nodes.some((node) => node.id === operation.id))
          throw new DiagramError(
            "VALIDATION_ERROR",
            `Düğüm bulunamadı: ${operation.id}`,
          );
        const removed = new Set([operation.id]);
        if (operation.cascade) {
          let changed = true;
          while (changed) {
            changed = false;
            for (const node of next.document.nodes)
              if (
                node.parentId &&
                removed.has(node.parentId) &&
                !removed.has(node.id)
              ) {
                removed.add(node.id);
                changed = true;
              }
          }
        } else if (
          next.document.nodes.some((node) => node.parentId === operation.id) ||
          next.document.edges.some(
            (edge) =>
              edge.source === operation.id || edge.target === operation.id,
          )
        ) {
          throw new DiagramError(
            "VALIDATION_ERROR",
            "Düğümün alt adımları veya bağlantıları var. Silmek için cascade: true kullanın.",
          );
        }
        next.document.nodes = next.document.nodes.filter(
          (node) => !removed.has(node.id),
        );
        next.document.edges = next.document.edges.filter(
          (edge) => !removed.has(edge.source) && !removed.has(edge.target),
        );
        break;
      }
      case "add_edge":
        if (next.document.edges.some((edge) => edge.id === operation.edge.id))
          throw new DiagramError(
            "VALIDATION_ERROR",
            `Bağlantı zaten var: ${operation.edge.id}`,
          );
        next.document.edges.push(operation.edge);
        break;
      case "update_edge": {
        const edge = next.document.edges.find(
          (item) => item.id === operation.id,
        );
        if (!edge)
          throw new DiagramError(
            "VALIDATION_ERROR",
            `Bağlantı bulunamadı: ${operation.id}`,
          );
        Object.assign(edge, operation.changes);
        break;
      }
      case "remove_edge": {
        if (!next.document.edges.some((edge) => edge.id === operation.id))
          throw new DiagramError(
            "VALIDATION_ERROR",
            `Bağlantı bulunamadı: ${operation.id}`,
          );
        next.document.edges = next.document.edges.filter(
          (edge) => edge.id !== operation.id,
        );
        break;
      }
    }
  }
  return {
    ...validated(createDiagramSchema, {
      title: next.title,
      description: next.description,
      tags: next.tags,
      document: next.document,
    }),
    archived: next.archived,
  };
}
