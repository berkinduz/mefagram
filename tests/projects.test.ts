import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDatabase } from "@/lib/db";
import { LOCAL_OWNER } from "@/lib/db/migrate";
import { DiagramService } from "@/lib/diagrams/service";

describe("projects and code references", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let service: DiagramService;
  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
    service = new DiagramService(db, "mcp");
  });
  afterAll(async () => {
    await db?.close();
  });

  const doc = (code: unknown[] = []) => ({
    schemaVersion: 1,
    nodes: [{ id: "login", label: "Login handler", code }],
    edges: [],
  });

  test("filters by project and keeps code references", async () => {
    const api = await service.create(
      LOCAL_OWNER,
      {
        title: "API flow",
        project: "shop-api",
        projectRoot: "/work/shop-api",
        document: doc([{ path: "src/auth/login.ts", line: 42 }]),
      },
      "project-a",
    );
    await service.create(
      LOCAL_OWNER,
      { title: "Web flow", project: "shop-web", document: doc() },
      "project-b",
    );
    const listed = await service.list(LOCAL_OWNER, { project: "shop-api" });
    expect(listed.map((item) => [item.title, item.project])).toEqual([
      ["API flow", "shop-api"],
    ]);
    expect((await service.list(LOCAL_OWNER)).length).toBe(2);
    const saved = await service.get(LOCAL_OWNER, api.id);
    expect(saved).toMatchObject({ projectRoot: "/work/shop-api" });
    expect(saved.document.nodes[0].code).toEqual([
      { path: "src/auth/login.ts", line: 42 },
    ]);
  });

  test("keeps the project when restoring a revision saved before it was set", async () => {
    const created = await service.create(
      LOCAL_OWNER,
      { title: "Legacy", document: doc() },
      "legacy-project",
    );
    // Simulate a revision written by an older release without project fields.
    await db.query(
      "UPDATE diagram_revisions SET content = content - 'project' - 'projectRoot' WHERE diagram_id = $1",
      [created.id],
    );
    const moved = await service.patch(
      LOCAL_OWNER,
      created.id,
      1,
      [{ op: "update_metadata", changes: { project: "later" } }],
      "set-project",
    );
    const restored = await service.restore(
      LOCAL_OWNER,
      created.id,
      1,
      moved.revision,
      "restore-legacy",
    );
    expect(restored.project).toBe("later");
  });

  test("rejects relative project roots and malformed code references", async () => {
    await expect(
      service.create(
        LOCAL_OWNER,
        { title: "Bad root", projectRoot: "relative/path", document: doc() },
        "bad-root",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.create(
        LOCAL_OWNER,
        { title: "Bad line", document: doc([{ path: "a.ts", line: 0 }]) },
        "bad-line",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
