import { defineConfig, devices } from "@playwright/test";

const smokeTestUrl = process.env.SMOKE_TEST_URL;

/**
 * Playwright configuration for smoke tests.
 *
 * Two modes:
 * - Local mode (no SMOKE_TEST_URL): builds locally and serves on port 4173
 * - Deploy mode (SMOKE_TEST_URL set): tests against a live URL
 *
 * @example
 * # Local/CI smoke tests (local build)
 * npm run test:e2e:smoke
 *
 * # Test production
 * SMOKE_TEST_URL=https://count.racku.la npm run test:e2e:smoke
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: ["smoke.spec.ts", "basic-workflow.spec.ts"],
  fullyParallel: true,
  retries: 2,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: smokeTestUrl || "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(smokeTestUrl
    ? {}
    : {
        webServer: {
          command: "npm run build && npm run preview",
          port: 4173,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
