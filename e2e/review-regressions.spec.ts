import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function create(
  page: Page,
  title: string,
  nodes = [{ id: "shared-node", label: "Node" }],
) {
  const response = await page.request.post("/api/diagrams", {
    headers: {
      "idempotency-key": crypto.randomUUID(),
    },
    data: { title, document: { schemaVersion: 1, nodes, edges: [] } },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function reloadLatest(page: Page) {
  await page.getByRole("button", { name: "Diagram actions" }).click();
  await page
    .getByRole("menuitem", { name: "Reload latest revision" })
    .click();
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
  const a = await create(page, "Delayed refresh A");
  const b = await create(page, "Delayed refresh B");
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
  await reloadLatest(page);
  await captured.promise;
  await page
    .getByRole("navigation", { name: "Diagram collection" })
    .getByRole("button", { name: /Delayed refresh B/ })
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
  const a = await create(page, "Delayed save A");
  const b = await create(page, "Delayed save B");
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
  await page.getByRole("button", { name: "Diagram actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await captured.promise;
  await page
    .getByRole("navigation", { name: "Diagram collection" })
    .getByRole("button", { name: /Delayed save B/ })
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
  const a = await create(page, "Out-of-order responses");
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
  await reloadLatest(page);
  await captured.promise;
  const changed = await page.request.patch(`/api/diagrams/${a.id}`, {
    headers: {
      "idempotency-key": crypto.randomUUID(),
    },
    data: {
      expectedRevision: a.revision,
      operations: [
        {
          op: "update_metadata",
          changes: { description: "New revision description" },
        },
      ],
    },
  });
  expect(changed.ok()).toBe(true);
  await reloadLatest(page);
  await expect(page.locator(".document-meta")).toContainText("Revision 2");
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
  await expect(page.locator(".document-meta")).toContainText("Revision 2");
  await expect(page.locator(".document-title-row")).toContainText(
    "New revision description",
  );
});

test("reimports the actual downloaded near-limit JSON file without losing content", async ({
  page,
}) => {
  const nodes = Array.from({ length: 40 }, (_, index) => ({
    id: `n${index}`,
    label: "Synthetic",
    notes: "x".repeat(49887),
  }));
  const a = await create(page, "Cafe\u0301 workflow", nodes);
  await page.goto(`/?diagram=${a.id}`);
  await page.getByRole("button", { name: "Diagram actions" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export as JSON" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("cafe\u0301-workflow.mefagram.json");
  const contents = await readFile((await download.path())!);
  expect(contents.length).toBeGreaterThan(2_000_000);
  await page
    .getByRole("button", { name: "Import diagram", exact: true })
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
    .getByRole("button", { name: "Import diagram", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const id = new URL(page.url()).searchParams.get("diagram");
  expect(id).not.toBe(a.id);
  const imported = await (await page.request.get(`/api/diagrams/${id}`)).json();
  expect(imported.document).toEqual(a.document);
});
