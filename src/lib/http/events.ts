import { z } from "zod";
import { idSchema } from "@/lib/diagrams/schema";

// In-process hub for live updates. Mefagram runs as one local Node process,
// so the browser's event stream, the HTTP API and the MCP endpoint share it.

export type WorkspaceEvent =
  | { type: "diagram"; id: string; revision: number }
  | { type: "comments"; diagramId: string };

export const viewSchema = z
  .object({
    diagramId: idSchema.nullable(),
    scopeId: idSchema.nullable().optional(),
    selectedId: idSchema.nullable().optional(),
    mode: z.enum(["map", "list"]).optional(),
  })
  .strict();
export type WorkspaceView = z.infer<typeof viewSchema> & { updatedAt: string };

interface Hub {
  listeners: Set<(event: WorkspaceEvent) => void>;
  view: WorkspaceView | null;
}
const store = globalThis as typeof globalThis & { mefagramHub?: Hub };
function hub() {
  store.mefagramHub ??= { listeners: new Set(), view: null };
  return store.mefagramHub;
}

export function publish(event: WorkspaceEvent) {
  for (const listener of hub().listeners) {
    try {
      listener(event);
    } catch {
      /* A closed stream must not stop other listeners. */
    }
  }
}

export function subscribe(listener: (event: WorkspaceEvent) => void) {
  hub().listeners.add(listener);
  return () => {
    hub().listeners.delete(listener);
  };
}

export function setView(view: z.infer<typeof viewSchema>) {
  hub().view = { ...view, updatedAt: new Date().toISOString() };
}

export function currentView() {
  return hub().view;
}

/** A text/event-stream response that forwards workspace events. */
export function eventStream(signal: AbortSignal) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      write(`retry: 3000\ndata: {"type":"ready"}\n\n`);
      const unsubscribe = subscribe((event) =>
        write(`data: ${JSON.stringify(event)}\n\n`),
      );
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* Already closed. */
        }
      };
      signal.addEventListener("abort", () => cleanup(), { once: true });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
