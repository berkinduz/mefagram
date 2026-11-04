import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

async function login(page: Page) {
  const access = JSON.parse(
    await readFile(
      process.env.MEFAGRAM_TEST_ACCESS_FILE ?? ".mefagram/e2e-access.json",
      "utf8",
    ),
  );
  await page.goto("/sign-in");
  await page.getByLabel("E-posta").fill(access.email);
  await page.getByLabel("Parola", { exact: true }).fill(access.password);
  await page.getByRole("button", { name: "Çalışma alanını aç" }).click();
  await expect(
    page.getByRole("navigation", { name: "Diyagram koleksiyonu" }),
  ).toBeVisible();
}

test("opens a real saved diagram, drills into a phase and keeps reading mode deliberate", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: /Mefa Apps ürün yaşam döngüsü/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Mefa Apps ürün yaşam döngüsü",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await page
    .getByRole("button", { name: "Ürün araştırması aşamasını aç" })
    .click();
  await expect(
    page.getByRole("button", { name: "Genel haritaya dön" }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  const problem = page.locator(".react-flow__node", {
    hasText: "Problemi tanımla",
  });
  await problem.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Düğüm detayları" }),
  ).toContainText("Mevcut çözümler neden yeterli değil?");
  await expect(async () => {
    const node = (await problem.boundingBox())!;
    const canvas = (await page.locator(".react-flow").boundingBox())!;
    expect(node.x).toBeGreaterThanOrEqual(canvas.x);
    expect(node.x + node.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  }).toPass();
  await expect(
    page.getByRole("button", { name: "Düğümü düzenle" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Düğümü düzenle" }),
  ).toBeVisible();
  await problem.focus();
  await page.keyboard.press("ArrowRight");
  const id = new URL(page.url()).searchParams.get("diagram");
  const nodeId = await problem.getAttribute("data-id");
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/diagrams/${id}`);
      const saved = await response.json();
      return saved.document.nodes.find(
        (node: { id: string }) => node.id === nodeId,
      )?.position?.x;
    })
    .toBeGreaterThan(0);
});

test("creates, edits and reopens a map from another browser session", async ({
  page,
  browser,
}) => {
  await login(page);
  const title = `Tarayıcı kayıt testi ${Date.now()}`;
  await page
    .getByRole("button", { name: "Yeni diyagram", exact: true })
    .click();
  await page.getByLabel("Diyagram adı").fill(title);
  await page
    .getByRole("button", { name: "Diyagramı oluştur", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByRole("button", { name: "Düğüm ekle", exact: true }).click();
  await page.getByLabel("Düğüm adı").fill("Kaydedilen düğüm");
  await page
    .getByLabel("Açıklama", { exact: true })
    .fill("Bağımsız oturumda da görünmeli.");
  await page
    .getByRole("button", { name: "Düğümü kaydet", exact: true })
    .click();
  await expect(
    page.getByText("Kaydedilen düğüm", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const separate = await browser.newContext();
  try {
    const second = await separate.newPage();
    await login(second);
    await second
      .getByRole("textbox", { name: "Diyagramlarda ara" })
      .fill(title);
    await second.getByRole("button", { name: new RegExp(title) }).click();
    await second.getByText("Kaydedilen düğüm", { exact: true }).first().click();
    await expect(
      second.getByRole("complementary", { name: "Düğüm detayları" }),
    ).toContainText("Bağımsız oturumda da görünmeli.");
  } finally {
    await separate.close();
  }
});

test("shows an expired login as a sign-in screen instead of exposing the workspace", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Çalışma alanını aç" }),
  ).toBeVisible();
  const response = await page.request.get("/api/diagrams");
  expect(response.status()).toBe(401);
});

test("shows real MCP writes in the reader and exports the saved content", async ({
  page,
  baseURL,
}) => {
  const access = JSON.parse(
    await readFile(
      process.env.MEFAGRAM_TEST_ACCESS_FILE ?? ".mefagram/e2e-access.json",
      "utf8",
    ),
  );
  const client = new Client({
    name: "browser-acceptance-agent",
    version: "1.0.0",
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
      requestInit: {
        headers: { authorization: `Bearer ${access.agentToken}` },
      },
    }),
  );
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain(
      "update_diagram",
    );
    const result = await client.callTool({
      name: "create_diagram",
      arguments: {
        title: "MCP tarayıcı doğrulaması",
        document: {
          schemaVersion: 1,
          nodes: [{ id: "mcp-reader", label: "Agentın eklediği adım" }],
          edges: [],
        },
        mutationId: crypto.randomUUID(),
      },
    });
    expect(result.isError).not.toBe(true);
    const saved = result.structuredContent as { id: string; revision: number };
    const update = await client.callTool({
      name: "update_diagram",
      arguments: {
        id: saved.id,
        expectedRevision: saved.revision,
        operations: [
          {
            op: "update_node",
            id: "mcp-reader",
            changes: {
              notes: "Gerçek HTTP MCP çağrısı kaydedildi.",
              sources: [{ label: "React Flow", url: "https://reactflow.dev/" }],
            },
          },
        ],
        mutationId: crypto.randomUUID(),
      },
    });
    expect(update.isError).not.toBe(true);
    await login(page);
    await page.goto(`/?diagram=${saved.id}`);
    await page
      .getByText("Agentın eklediği adım", { exact: true })
      .first()
      .click();
    const details = page.getByRole("complementary", {
      name: "Düğüm detayları",
    });
    await expect(details).toContainText("Gerçek HTTP MCP çağrısı kaydedildi.");
    await expect(
      details.getByRole("link", { name: /React Flow/ }),
    ).toHaveAttribute("href", "https://reactflow.dev/");
    await page.getByRole("button", { name: "Diyagram işlemleri" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("menuitem", { name: "JSON olarak dışa aktar" })
      .click();
    const download = await downloadPromise;
    const exported = JSON.parse(
      await readFile((await download.path())!, "utf8"),
    );
    expect(exported.diagram.document.nodes[0].notes).toBe(
      "Gerçek HTTP MCP çağrısı kaydedildi.",
    );
    expect(exported.source.revision).toBe(2);
  } finally {
    await client.close();
  }
});

test("keeps a failed form and safely reconciles a lost save response after further edits", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("button", { name: /Mefa Apps ürün yaşam döngüsü/ })
    .click();
  await page
    .getByRole("button", { name: "Ürün araştırması aşamasını aç" })
    .click();
  await page.getByText("Problemi tanımla", { exact: true }).first().click();
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByRole("button", { name: "Düğümü düzenle" }).click();
  const description = page.getByRole("textbox", {
    name: "Açıklama",
    exact: true,
  });
  await description.fill("İlk kayıt sunucuda tamamlandı.");
  await page.route(
    "**/api/diagrams/*",
    async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Düğümü kaydet", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(description).toHaveValue("İlk kayıt sunucuda tamamlandı.");
  await description.fill("Yanıt kaybolduktan sonra gözden geçirilen açıklama.");
  await page
    .getByRole("button", { name: "Düğümü kaydet", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "daha yeni bir sürümü",
  );
  await page
    .getByRole("button", { name: "Düğümü kaydet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Düğüm detayları" }),
  ).toContainText("Yanıt kaybolduktan sonra gözden geçirilen açıklama.");
});

test("retries an unacknowledged creation without duplicating the diagram", async ({
  page,
}) => {
  await login(page);
  const title = `Yanıtı kaybolan yeni diyagram ${Date.now()}`;
  await page
    .getByRole("button", { name: "Yeni diyagram", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Diyagram adı", exact: true });
  await name.fill(title);
  await page.route(
    "**/api/diagrams",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Diyagramı oluştur", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(name).not.toBeEditable();
  await page
    .getByRole("button", { name: "Diyagramı oluştur", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const all = await page.request.get("/api/diagrams");
  expect(
    (await all.json()).filter((row: { title: string }) => row.title === title),
  ).toHaveLength(1);
});

test("keeps a large hierarchical diagram readable and navigable", async ({
  page,
  baseURL,
}) => {
  const access = JSON.parse(
    await readFile(
      process.env.MEFAGRAM_TEST_ACCESS_FILE ?? ".mefagram/e2e-access.json",
      "utf8",
    ),
  );
  const nodes = Array.from({ length: 6 }, (_, phase) => [
    {
      id: `phase-${phase}`,
      label: `Büyük harita aşama ${phase + 1}`,
      kind: "phase",
    },
    ...Array.from({ length: 24 }, (_, step) => ({
      id: `step-${phase}-${step}`,
      parentId: `phase-${phase}`,
      label: `İncelenecek adım ${step + 1}`,
      description: "Detayları açarak veya liste görünümünde okuyabilirsin.",
    })),
  ]).flat();
  const edges = Array.from({ length: 6 }, (_, phase) => [
    ...(phase < 5
      ? [
          {
            id: `phase-edge-${phase}`,
            source: `phase-${phase}`,
            target: `phase-${phase + 1}`,
          },
        ]
      : []),
    ...Array.from({ length: 23 }, (_, step) => ({
      id: `edge-${phase}-${step}`,
      source: `step-${phase}-${step}`,
      target: `step-${phase}-${step + 1}`,
    })),
  ]).flat();
  const response = await page.request.post(`${baseURL}/api/diagrams`, {
    headers: {
      authorization: `Bearer ${access.agentToken}`,
      "idempotency-key": crypto.randomUUID(),
    },
    data: {
      title: "150 düğümlü harita",
      document: { schemaVersion: 1, nodes, edges },
    },
  });
  expect(response.ok()).toBe(true);
  const saved = await response.json();
  await login(page);
  await page.goto(`/?diagram=${saved.id}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Büyük harita aşama 1 aşamasını aç" })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(24);
  await expect(async () => {
    expect(
      (await page.locator(".react-flow__node").first().boundingBox())!.width,
    ).toBeGreaterThan(130);
  }).toPass({ timeout: 6000 });
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.locator(".reading-row")).toHaveCount(24);
  await page
    .getByRole("button", { name: /İncelenecek adım 24 Detayları/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Düğüm detayları" }),
  ).toContainText("İncelenecek adım 24");
});
