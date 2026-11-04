import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import { createDatabase } from "@/lib/db";
import { createAuth } from "@/lib/auth/server";
import { PersonalTokenService } from "@/lib/auth/tokens";
import { resolveIdentity } from "@/lib/auth/identity";

describe("private owner access and revocable agent credentials", () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;
  let auth: ReturnType<typeof createAuth>;
  let ownerId: string;
  const baseURL = "http://localhost:3100";
  const setupKey = randomBytes(32).toString("hex");
  const password = randomBytes(24).toString("base64url");
  beforeAll(async () => {
    db = await createDatabase({ dataDir: "memory://" });
    auth = createAuth(db, {
      baseURL,
      secret: randomBytes(40).toString("hex"),
      setupKey,
      ownerEmail: "owner@mefagram.local",
    });
    const owner = await auth.api.signUpEmail({
      body: { email: "owner@mefagram.local", password, name: "Owner" },
      headers: new Headers({ "x-mefagram-setup-key": setupKey }),
    });
    ownerId = owner.user.id;
  });
  afterAll(async () => {
    await db?.close();
  });

  test("blocks public account registration and repeated owner bootstrap", async () => {
    const publicRequest = new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({
        email: "stranger@mefagram.local",
        password,
        name: "Stranger",
      }),
    });
    expect((await auth.handler(publicRequest)).status).toBe(403);
    await expect(
      auth.api.signUpEmail({
        body: { email: "owner@mefagram.local", password, name: "Another" },
        headers: new Headers({ "x-mefagram-setup-key": setupKey }),
      }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  test("authenticates the owner and rejects unsigned requests", async () => {
    await expect(
      resolveIdentity(
        new Request(`${baseURL}/api/diagrams`),
        auth,
        db,
        "diagrams:read",
        baseURL,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL },
        body: JSON.stringify({ email: "owner@mefagram.local", password }),
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const identity = await resolveIdentity(
      new Request(`${baseURL}/api/diagrams`, { headers: { cookie } }),
      auth,
      db,
      "diagrams:read",
      baseURL,
    );
    expect(identity.userId).toBe(ownerId);
    expect(identity.actor).toBe("web");
    await expect(
      resolveIdentity(
        new Request(`${baseURL}/api/diagrams`, {
          method: "POST",
          headers: { cookie, origin: "https://unrelated.example" },
        }),
        auth,
        db,
        "diagrams:write",
        baseURL,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("stores only token hashes, enforces scopes and revokes immediately", async () => {
    const tokens = new PersonalTokenService(db);
    const issued = await tokens.create(ownerId, {
      name: "Read-only agent",
      scopes: ["diagrams:read"],
      expiresInDays: 30,
    });
    const rows = await db.query(
      "SELECT token_hash FROM personal_tokens WHERE id = $1",
      [issued.id],
    );
    expect(rows.rows[0].token_hash).not.toBe(issued.token);
    const request = new Request(`${baseURL}/api/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${issued.token}` },
    });
    expect(
      (await resolveIdentity(request, auth, db, "diagrams:read", baseURL))
        .userId,
    ).toBe(ownerId);
    await expect(
      resolveIdentity(request, auth, db, "diagrams:write", baseURL),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_SCOPE" });
    await tokens.revoke(ownerId, issued.id);
    await expect(
      resolveIdentity(request, auth, db, "diagrams:read", baseURL),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("does not let a different owner revoke a token", async () => {
    const tokens = new PersonalTokenService(db);
    const issued = await tokens.create(ownerId, {
      name: "Owner agent",
      scopes: ["diagrams:read", "diagrams:write"],
      expiresInDays: 30,
    });
    await expect(
      tokens.revoke("another-owner", issued.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await tokens.verify(issued.token))?.userId).toBe(ownerId);
    expect((await tokens.list(ownerId))[0]).not.toHaveProperty("token_hash");
  });
});
