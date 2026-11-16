import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createDatabase, type Database } from "@/lib/db";
import { DiagramService } from "@/lib/diagrams/service";
import { LOCAL_OWNER } from "@/lib/db/migrate";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "native Postgres integration (isolated test database)",
  () => {
    let admin: Pool;
    let db: Database;
    let connectionString: string;
    const ownerId = LOCAL_OWNER;
    const database = `mefagram_test_${randomUUID().replaceAll("-", "")}`;
    beforeAll(async () => {
      admin = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        connectionTimeoutMillis: 5000,
      });
      await admin.query(`CREATE DATABASE "${database}"`);
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.pathname = `/${database}`;
      url.searchParams.set("options", "-c search_path=public");
      connectionString = url.toString();
      db = await createDatabase({ databaseUrl: connectionString });
    });
    afterAll(async () => {
      await db?.close();
      if (admin) {
        try {
          await admin.query(
            `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
          );
        } finally {
          await admin.end();
        }
      }
    });

    test("migrates real Postgres and persists an owner-scoped diagram", async () => {
      const service = new DiagramService(db);
      const saved = await service.create(
        ownerId,
        {
          title: "Native Postgres",
          document: {
            schemaVersion: 1,
            nodes: [{ id: "native", label: "Native persistence" }],
            edges: [],
          },
        },
        "pg-create",
      );
      expect((await service.get(ownerId, saved.id)).document).toEqual(
        saved.document,
      );
      await expect(service.get("other-owner", saved.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("serializes concurrent writers without losing history", async () => {
      const service = new DiagramService(db);
      const saved = (await service.list(ownerId))[0];
      const results = await Promise.allSettled(
        [0, 1].map((index) =>
          service.patch(
            ownerId,
            saved.id,
            saved.revision,
            [
              {
                op: "update_node",
                id: "native",
                changes: { notes: `Writer ${index}` },
              },
            ],
            `pg-write-${index}`,
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "REVISION_CONFLICT" } });
      expect(await service.revisions(ownerId, saved.id)).toHaveLength(2);
    });

    test("reopens the same Postgres database and round-trips an export", async () => {
      const saved = (await new DiagramService(db).list(ownerId))[0];
      await db.close();
      db = await createDatabase({ databaseUrl: connectionString });
      const service = new DiagramService(db);
      expect((await service.get(ownerId, saved.id)).revision).toBe(2);
      const exported = await service.export(ownerId, saved.id);
      const imported = await service.import(ownerId, exported, "pg-import");
      expect(imported.document).toEqual(exported.diagram.document);
    });
  },
);
