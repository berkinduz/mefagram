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
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Email").fill(access.email);
  await page.getByLabel("Password", { exact: true }).fill(access.password);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("navigation", { name: "Diagram collection" }),
  ).toBeVisible();
}

test("opens a real saved diagram, drills into a phase and keeps reading mode deliberate", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: /Relay newsletter workflow/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Relay newsletter workflow",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Open Collect ideas phase" })
    .click();
  await expect(
    page.getByRole("button", { name: "Back to overview" }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  const problem = page.locator(".react-flow__node", {
    hasText: "Collect questions",
  });
  await problem.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Node details" }),
  ).toContainText("A fictional step in the Relay newsletter demo.");
  await expect(async () => {
    const node = (await problem.boundingBox())!;
    const canvas = (await page.locator(".react-flow").boundingBox())!;
    expect(node.x).toBeGreaterThanOrEqual(canvas.x);
    expect(node.x + node.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  }).toPass();
  await expect(
    page.getByRole("button", { name: "Edit node" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit node" }),
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
  const title = `Browser save test ${Date.now()}`;
  await page
    .getByRole("button", { name: "New diagram", exact: true })
    .click();
  await page.getByLabel("Diagram name").fill(title);
  await page
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Add node", exact: true }).click();
  await page.getByLabel("Node name").fill("Saved node");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Visible in a separate browser session.");
  await page
    .getByRole("button", { name: "Save node", exact: true })
    .click();
  await expect(
    page.getByText("Saved node", { exact: true }).first(),
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
      .getByRole("textbox", { name: "Search diagrams" })
      .fill(title);
    await second.getByRole("button", { name: new RegExp(title) }).click();
    await second.getByText("Saved node", { exact: true }).first().click();
    await expect(
      second.getByRole("complementary", { name: "Node details" }),
    ).toContainText("Visible in a separate browser session.");
  } finally {
    await separate.close();
  }
});

test("shows an expired login as a sign-in screen instead of exposing the workspace", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open workspace" }),
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
        title: "MCP browser verification",
        document: {
          schemaVersion: 1,
          nodes: [{ id: "mcp-reader", label: "Step added by an agent" }],
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
              notes: "Saved through a real HTTP MCP call.",
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
      .getByText("Step added by an agent", { exact: true })
      .first()
      .click();
    const details = page.getByRole("complementary", {
      name: "Node details",
    });
    await expect(details).toContainText("Saved through a real HTTP MCP call.");
    await expect(
      details.getByRole("link", { name: /React Flow/ }),
    ).toHaveAttribute("href", "https://reactflow.dev/");
    await page.getByRole("button", { name: "Diagram actions" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("menuitem", { name: "Export as JSON" })
      .click();
    const download = await downloadPromise;
    const exported = JSON.parse(
      await readFile((await download.path())!, "utf8"),
    );
    expect(exported.diagram.document.nodes[0].notes).toBe(
      "Saved through a real HTTP MCP call.",
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
  await page.getByRole("button", { name: /Relay newsletter workflow/ }).click();
  await page
    .getByRole("button", { name: "Open Collect ideas phase" })
    .click();
  await page.getByText("Collect questions", { exact: true }).first().click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Edit node" }).click();
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  await description.fill("The first save completed on the server.");
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
    .getByRole("button", { name: "Save node", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(description).toHaveValue("The first save completed on the server.");
  await description.fill("Revised description after the response was lost.");
  await page
    .getByRole("button", { name: "Save node", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "newer revision",
  );
  await page
    .getByRole("button", { name: "Save node", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Node details" }),
  ).toContainText("Revised description after the response was lost.");
});

test("retries an unacknowledged creation without duplicating the diagram", async ({
  page,
}) => {
  await login(page);
  const title = `New diagram with a lost response ${Date.now()}`;
  await page
    .getByRole("button", { name: "New diagram", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Diagram name", exact: true });
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
    .getByRole("button", { name: "Create diagram", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(name).not.toBeEditable();
  await page
    .getByRole("button", { name: "Create diagram", exact: true })
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
      label: `Large map phase ${phase + 1}`,
      kind: "phase",
    },
    ...Array.from({ length: 24 }, (_, step) => ({
      id: `step-${phase}-${step}`,
      parentId: `phase-${phase}`,
      label: `Step to review ${step + 1}`,
      description: "Read the details in the inspector or list view.",
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
      title: "150-node map",
      document: { schemaVersion: 1, nodes, edges },
    },
  });
  expect(response.ok()).toBe(true);
  const saved = await response.json();
  await login(page);
  await page.goto(`/?diagram=${saved.id}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Open Large map phase 1 phase" })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(24);
  await expect(async () => {
    expect(
      (await page.locator(".react-flow__node").first().boundingBox())!.width,
    ).toBeGreaterThan(130);
  }).toPass({ timeout: 6000 });
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".reading-row")).toHaveCount(24);
  await page
    .getByRole("button", { name: /Step to review 24 Read the details/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Node details" }),
  ).toContainText("Step to review 24");
});
