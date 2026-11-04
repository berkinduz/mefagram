import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.MEFAGRAM_TEST_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1512, height: 982 },
      },
    },
  ],
  webServer: process.env.MEFAGRAM_TEST_URL
    ? undefined
    : {
        command: "npx tsx scripts/test-server.ts",
        url: "http://127.0.0.1:3100/api/diagrams",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
