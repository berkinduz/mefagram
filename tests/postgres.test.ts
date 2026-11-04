import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createDatabase, type Database } from "@/lib/db";
import { DiagramService } from "@/lib/diagrams/service";
import { createAuth } from "@/lib/auth/server";
import { PersonalTokenService } from "@/lib/auth/tokens";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "native Postgres integration (isolated test schema)",
  () => {
    let admin: Pool;
    let db: Database;
    let connectionString: string;
    let ownerId: string;
    const schema = `mefagram_test_${randomUUID().replaceAll("-", "")}`;
    beforeAll(async () => {
      admin = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        connectionTimeoutMillis: 5000,
      });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.searchParams.set("options", `-c search_path=${schema}`);
      connectionString = url.toString();
      db = await createDatabase({ databaseUrl: connectionString });
    });
    afterAll(async () => {
      await db?.close();
      if (admin) {
        try {
          await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await admin.end();
        }
      }
    });

    test("bootstraps real Postgres auth, verifies a token and persists a diagram", async () => {
      const setupKey = randomBytes(32).toString("hex");
      const auth = createAuth(db, {
        baseURL: "http://127.0.0.1:3300",
        ownerEmail: "postgres-test@mefagram.local",
        secret: randomBytes(40).toString("hex"),
        setupKey,
      });
      const password = randomBytes(24).toString("base64url");
      ownerId = (
        await auth.api.signUpEmail({
          body: {
            name: "Postgres test",
            email: "postgres-test@mefagram.local",
            password,
          },
          headers: new Headers({ "x-mefagram-setup-key": setupKey }),
        })
      ).user.id;
      expect(
        (
          await auth.api.signInEmail({
            body: { email: "postgres-test@mefagram.local", password },
          })
        ).user.id,
      ).toBe(ownerId);
      const tokens = new PersonalTokenService(db);
      const issued = await tokens.create(ownerId, {
        name: "Postgres client",
        scopes: ["diagrams:read", "diagrams:write"],
        expiresInDays: 1,
      });
      expect((await tokens.verify(issued.token))?.userId).toBe(ownerId);
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
