import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "@/lib/db";
import { DiagramService } from "@/lib/diagrams/service";

const fixture = {
  title: "Example workflow map",
  description: "A process map",
  tags: ["studio"],
  document: {
    schemaVersion: 1 as const,
    nodes: [
      {
        id: "research",
        label: "Research",
        kind: "phase" as const,
        description: "Research the idea",
        notes: "",
        sources: [],
      },
      {
        id: "release",
        label: "Release",
        kind: "phase" as const,
        description: "",
        notes: "",
        sources: [],
      },
    ],
    edges: [
      {
        id: "research-release",
        source: "research",
        target: "release",
        kind: "flow" as const,
        label: "Validated",
      },
    ],
  },
};

describe("persistent diagram operations", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let service: DiagramService;
  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
    service = new DiagramService(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  test("round-trips valid content near the limit through compact and formatted export envelopes", async () => {
    const content = {
      title: "Synthetic",
      document: {
        schemaVersion: 1,
        nodes: Array.from({ length: 40 }, (_, index) => ({
          id: `n${index}`,
          label: "Synthetic",
          notes: "x".repeat(49898),
        })),
        edges: [],
      },
    };
    const saved = await service.create(
      "boundary-owner",
      content,
      "boundary-create",
    );
    const exported = await service.export("boundary-owner", saved.id);
    expect(Buffer.byteLength(JSON.stringify(exported))).toBeGreaterThan(
      2_000_000,
    );
    for (const [index, data] of [
      JSON.stringify(exported),
      JSON.stringify(exported, null, 2),
    ].entries()) {
      const imported = await service.import(
        "boundary-owner",
        JSON.parse(data),
        `boundary-import-${index}`,
      );
      expect(imported.document).toEqual(saved.document);
    }
    await expect(
      service.create(
        "boundary-owner",
        {
          ...content,
          document: {
            ...content.document,
            nodes: content.document.nodes.map((node) => ({
              ...node,
              notes: "x".repeat(50000),
            })),
          },
        },
        "boundary-oversize",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("saves a graph and lets the owner find it by a node description", async () => {
    const saved = await service.create("owner-find", fixture, "create-find");
    expect(saved.revision).toBe(1);
    const found = await service.list("owner-find", { search: "Research the idea" });
    expect(found.map((item) => item.id)).toContain(saved.id);
    const loaded = await service.get("owner-find", saved.id);
    expect(loaded.document.edges).toEqual([
      {
        id: "research-release",
        source: "research",
        target: "release",
        kind: "flow",
        label: "Validated",
      },
    ]);
  });

  test("does not expose another owner’s map, search result or revisions", async () => {
    const saved = await service.create(
      "private-owner",
      fixture,
      "private-create",
    );
    expect(await service.list("stranger", {})).toEqual([]);
    await expect(service.get("stranger", saved.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.revisions("stranger", saved.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    await expect(
      service.patch(
        "stranger",
        saved.id,
        1,
        [{ op: "update_metadata", changes: { title: "Stolen" } }],
        "steal",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("rejects dangling edges and hierarchy cycles before saving", async () => {
    await expect(
      service.create(
        "invalid-owner",
        {
          ...fixture,
          document: {
            ...fixture.document,
            edges: [
              {
                id: "broken",
                source: "research",
                target: "missing",
                kind: "flow",
              },
            ],
          },
        },
        "invalid-edge",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.create(
        "invalid-owner",
        {
          ...fixture,
          document: {
            ...fixture.document,
            nodes: [
              { ...fixture.document.nodes[0], parentId: "release" },
              { ...fixture.document.nodes[1], parentId: "research" },
            ],
          },
        },
        "invalid-hierarchy",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await service.list("invalid-owner", {})).toEqual([]);
  });

  test("permits feedback edges while rejecting script source links", async () => {
    const saved = await service.create(
      "feedback-owner",
      {
        ...fixture,
        document: {
          ...fixture.document,
          edges: [
            ...fixture.document.edges,
            {
              id: "feedback",
              source: "release",
              target: "research",
              kind: "feedback",
            },
          ],
        },
      },
      "create-feedback",
    );
    expect(saved.document.edges).toHaveLength(2);
    await expect(
      service.patch(
        "feedback-owner",
        saved.id,
        1,
        [
          {
            op: "update_node",
            id: "research",
            changes: {
              sources: [{ label: "Bad link", url: "javascript:alert(1)" }],
            },
          },
        ],
        "bad-url",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("updates only requested fields, persists history and restores as a new revision", async () => {
    const saved = await service.create(
      "history-owner",
      fixture,
      "history-create",
    );
    const changed = await service.patch(
      "history-owner",
      saved.id,
      1,
      [
        {
          op: "update_node",
          id: "research",
          changes: { notes: "Interview notes" },
        },
      ],
      "history-update",
    );
    expect(changed.revision).toBe(2);
    expect(changed.document.nodes[0]).toMatchObject({
      label: "Research",
      description: "Research the idea",
      notes: "Interview notes",
    });
    expect(changed.document.edges).toHaveLength(1);
    const history = await service.revisions("history-owner", saved.id);
    expect(history.map((item) => item.revision)).toEqual([2, 1]);
    const restored = await service.restore(
      "history-owner",
      saved.id,
      1,
      2,
      "history-restore",
    );
    expect(restored.revision).toBe(3);
    expect(restored.document.nodes[0].notes).toBe("");
  });

  test("presents legacy system summaries in English without rewriting saved history", async () => {
    // These are exact system-generated summaries from releases before v0.1.2.
    const cases = [
      ["Diyagram oluşturuldu", "Diagram created"],
      ["Diyagram bilgileri güncellendi", "Diagram details updated"],
      ["Düğüm eklendi", "Node added"],
      ["Düğüm güncellendi", "Node updated"],
      ["Düğüm silindi", "Node removed"],
      ["Bağlantı eklendi", "Connection added"],
      ["Bağlantı güncellendi", "Connection updated"],
      ["Bağlantı silindi", "Connection removed"],
      ["2 değişiklik uygulandı", "2 changes applied"],
      ["Sürüm 12 geri yüklendi", "Restored revision 12"],
      ["Custom migration note", "Custom migration note"],
    ];
    for (const [index, [summary, expected]] of cases.entries()) {
      const saved = await service.create(
        "legacy-summary-owner",
        fixture,
        `legacy-summary-${index}`,
      );
      await db.query(
        "UPDATE diagram_revisions SET summary = $1 WHERE diagram_id = $2",
        [summary, saved.id],
      );
      const rawHistory = () =>
        db.query(
          "SELECT * FROM diagram_revisions WHERE diagram_id = $1",
          [saved.id],
        );
      const before = (await rawHistory()).rows;
      expect(
        await service.revisions("legacy-summary-owner", saved.id),
      ).toMatchObject([{ revision: 1, summary: expected }]);
      expect((await rawHistory()).rows).toEqual(before);
      expect(await service.get("legacy-summary-owner", saved.id)).toEqual(saved);
    }
  });

  test("rejects a stale edit and allows only one of two concurrent writers", async () => {
    const saved = await service.create("race-owner", fixture, "race-create");
    const results = await Promise.allSettled([
      service.patch(
        "race-owner",
        saved.id,
        1,
        [{ op: "update_metadata", changes: { title: "First" } }],
        "race-one",
      ),
      service.patch(
        "race-owner",
        saved.id,
        1,
        [{ op: "update_metadata", changes: { title: "Second" } }],
        "race-two",
      ),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(
      results
        .filter((item) => item.status === "rejected")
        .map((item) => item.reason.code),
    ).toEqual(["REVISION_CONFLICT"]);
    expect((await service.get("race-owner", saved.id)).revision).toBe(2);
  });

  test("deduplicates a retried mutation and rejects a reused key with different content", async () => {
    const first = await service.create("retry-owner", fixture, "same-request");
    const retry = await service.create("retry-owner", fixture, "same-request");
    expect(retry.id).toBe(first.id);
    expect(await service.list("retry-owner", {})).toHaveLength(1);
    const operations = [
      { op: "update_metadata" as const, changes: { title: "New title" } },
    ];
    const update = await service.patch(
      "retry-owner",
      first.id,
      1,
      operations,
      "same-update",
    );
    const updateRetry = await service.patch(
      "retry-owner",
      first.id,
      1,
      operations,
      "same-update",
    );
    expect(updateRetry.revision).toBe(update.revision);
    await expect(
      service.create(
        "retry-owner",
        { ...fixture, title: "Different" },
        "same-request",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  test("rolls back the entire patch when its final graph is invalid", async () => {
    const saved = await service.create(
      "atomic-owner",
      fixture,
      "atomic-create",
    );
    await expect(
      service.patch(
        "atomic-owner",
        saved.id,
        1,
        [
          { op: "update_metadata", changes: { title: "Must not save" } },
          {
            op: "add_edge",
            edge: {
              id: "invalid",
              source: "research",
              target: "unknown",
              kind: "flow",
            },
          },
        ],
        "atomic-patch",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const unchanged = await service.get("atomic-owner", saved.id);
    expect(unchanged.title).toBe("Example workflow map");
    expect(unchanged.revision).toBe(1);
    expect(await service.revisions("atomic-owner", saved.id)).toHaveLength(1);
  });

  test("keeps omitted metadata and edge fields when applying a partial edit", async () => {
    const saved = await service.create(
      "partial-owner",
      {
        ...fixture,
        document: {
          ...fixture.document,
          edges: [
            {
              id: "loop",
              source: "release",
              target: "research",
              kind: "feedback",
              label: "Learn",
            },
          ],
        },
      },
      "partial-create",
    );
    const updated = await service.patch(
      "partial-owner",
      saved.id,
      1,
      [
        { op: "update_metadata", changes: { title: "Title changed" } },
        { op: "update_edge", id: "loop", changes: { label: "Learn again" } },
      ],
      "partial-update",
    );
    expect(updated.description).toBe("A process map");
    expect(updated.tags).toEqual(["studio"]);
    expect(updated.document.edges[0].kind).toBe("feedback");
  });

  test("exports editable content and imports it under a new identity", async () => {
    const saved = await service.create(
      "export-owner",
      fixture,
      "export-create",
    );
    const exported = await service.export("export-owner", saved.id);
    expect(exported.format).toBe("mefagram");
    const imported = await service.import(
      "import-owner",
      exported,
      "import-create",
    );
    expect(imported.id).not.toBe(saved.id);
    expect(imported.document.nodes.map((item) => item.id)).toEqual([
      "research",
      "release",
    ]);
    expect(imported.document.edges[0].label).toBe("Validated");
  });

  test("can move a child to the top level and clear a manual position explicitly", async () => {
    const saved = await service.create(
      "move-owner",
      {
        ...fixture,
        document: {
          ...fixture.document,
          nodes: [
            fixture.document.nodes[0],
            {
              ...fixture.document.nodes[1],
              parentId: "research",
              position: { x: 50, y: 80 },
            },
          ],
        },
      },
      "move-create",
    );
    const moved = await service.patch(
      "move-owner",
      saved.id,
      1,
      [
        {
          op: "update_node",
          id: "release",
          changes: { parentId: null, position: null },
        },
      ],
      "move-child",
    );
    expect(moved.document.nodes[1].parentId).toBeNull();
    expect(moved.document.nodes[1].position).toBeNull();
    expect(moved.document.nodes[1].label).toBe("Release");
  });
});

test("retains saved content after closing and reopening the filesystem database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mefagram-persist-"));
  let database = await createDatabase({ dataDir: join(directory, "db") });
  try {
    const saved = await new DiagramService(database).create(
      "restart-owner",
      fixture,
      "restart-create",
    );
    await database.close();
    database = await createDatabase({ dataDir: join(directory, "db") });
    const reopened = await new DiagramService(database).get(
      "restart-owner",
      saved.id,
    );
    expect(reopened.title).toBe("Example workflow map");
    expect(reopened.document.nodes[0].description).toBe("Research the idea");
    expect(reopened.revision).toBe(1);
  } finally {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
