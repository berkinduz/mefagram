import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

let access: {
  email: string;
  password: string;
  agentToken: string;
  baseURL: string;
};
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser }) => {
  access = JSON.parse(
    await readFile(
      process.env.MEFAGRAM_TEST_ACCESS_FILE ?? ".mefagram/e2e-access.json",
      "utf8",
    ),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${access.baseURL}/sign-in`);
  await page.getByLabel("E-posta").fill(access.email);
  await page.getByLabel("Parola", { exact: true }).fill(access.password);
  await page.getByRole("button", { name: "Çalışma alanını aç" }).click();
  await page
    .getByRole("navigation", { name: "Diyagram koleksiyonu" })
    .waitFor();
  cookies = await context.cookies();
  await context.close();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
});

async function create(
  page: Page,
  title: string,
  nodes = [{ id: "shared-node", label: "Düğüm" }],
) {
  const response = await page.request.post("/api/diagrams", {
    headers: {
      authorization: `Bearer ${access.agentToken}`,
      "idempotency-key": crypto.randomUUID(),
    },
    data: { title, document: { schemaVersion: 1, nodes, edges: [] } },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("ignores a late refresh from a diagram that is no longer active", async ({
  page,
}) => {
  const a = await create(page, "Geciken yenileme A");
  const b = await create(page, "Geciken yenileme B");
  await page.goto(`/?diagram=${a.id}`);
  const captured = deferred();
  const release = deferred();
  await page.route(
    `**/api/diagrams/${a.id}`,
    async (route) => {
      const response = await route.fetch();
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Diyagramı yenile" }).click();
  await captured.promise;
  await page
    .getByRole("navigation", { name: "Diyagram koleksiyonu" })
    .getByRole("button", { name: /Geciken yenileme B/ })
    .click();
  await expect(
    page.getByRole("heading", { name: b.title, exact: true }),
  ).toBeVisible();
  const completed = page.waitForResponse((response) =>
    response.url().endsWith(`/api/diagrams/${a.id}`),
  );
  release.resolve();
  await completed;
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: b.title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(b.id));
});

test("ignores a late save completion after navigating to another diagram", async ({
  page,
}) => {
  const a = await create(page, "Geciken kayıt A");
  const b = await create(page, "Geciken kayıt B");
  await page.goto(`/?diagram=${a.id}`);
  const captured = deferred();
  const release = deferred();
  await page.route(
    `**/api/diagrams/${a.id}`,
    async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      const response = await route.fetch();
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Diyagram işlemleri" }).click();
  await page.getByRole("menuitem", { name: "Arşive taşı" }).click();
  await captured.promise;
  await page
    .getByRole("navigation", { name: "Diyagram koleksiyonu" })
    .getByRole("button", { name: /Geciken kayıt B/ })
    .click();
  await expect(
    page.getByRole("heading", { name: b.title, exact: true }),
  ).toBeVisible();
  const completed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/diagrams/${a.id}`) &&
      response.request().method() === "PATCH",
  );
  release.resolve();
  await completed;
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: b.title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(b.id));
});

test("does not regress a newer revision when an earlier refresh arrives last", async ({
  page,
}) => {
  const a = await create(page, "Sırası değişen yanıtlar");
  await page.goto(`/?diagram=${a.id}`);
  const captured = deferred();
  const release = deferred();
  await page.route(
    `**/api/diagrams/${a.id}`,
    async (route) => {
      const response = await route.fetch();
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Diyagramı yenile" }).click();
  await captured.promise;
  const changed = await page.request.patch(`/api/diagrams/${a.id}`, {
    headers: {
      authorization: `Bearer ${access.agentToken}`,
      "idempotency-key": crypto.randomUUID(),
    },
    data: {
      expectedRevision: a.revision,
      operations: [
        {
          op: "update_metadata",
          changes: { description: "Yeni sürümün açıklaması" },
        },
      ],
    },
  });
  expect(changed.ok()).toBe(true);
  await page.getByRole("button", { name: "Diyagramı yenile" }).click();
  await expect(page.locator(".map-footer")).toContainText("Sürüm 2");
  const completed = page.waitForResponse((response) =>
    response.url().endsWith(`/api/diagrams/${a.id}`),
  );
  release.resolve();
  await completed;
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await expect(page.locator(".map-footer")).toContainText("Sürüm 2");
  await expect(page.locator(".document-title-row")).toContainText(
    "Yeni sürümün açıklaması",
  );
});

test("reimports the actual downloaded near-limit JSON file without losing content", async ({
  page,
}) => {
  const nodes = Array.from({ length: 40 }, (_, index) => ({
    id: `n${index}`,
    label: "Synthetic",
    notes: "x".repeat(49898),
  }));
  const a = await create(page, "Synthetic", nodes);
  await page.goto(`/?diagram=${a.id}`);
  await page.getByRole("button", { name: "Diyagram işlemleri" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "JSON olarak dışa aktar" }).click();
  const download = await pending;
  const contents = await readFile((await download.path())!);
  expect(contents.length).toBeGreaterThan(2_000_000);
  await page
    .getByRole("button", { name: "Diyagramı içe aktar", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "large.mefagram.json",
      mimeType: "application/json",
      buffer: contents,
    });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Diyagramı içe aktar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const id = new URL(page.url()).searchParams.get("diagram");
  expect(id).not.toBe(a.id);
  const imported = await (await page.request.get(`/api/diagrams/${id}`)).json();
  expect(imported.document).toEqual(a.document);
});

test("reports a failed sign-out and only leaves the workspace after successful revocation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Diyagram koleksiyonu" })
    .waitFor();
  await page.route(
    "**/api/auth/sign-out",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"Synthetic rejection"}',
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Oturumu kapat", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Oturum kapatılamadı" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Diyagram koleksiyonu" }),
  ).toBeVisible();
  expect((await page.request.get("/api/diagrams")).status()).toBe(200);
  await page
    .getByRole("button", { name: "Oturumu kapat", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get("/api/diagrams")).status()).toBe(401);
});
