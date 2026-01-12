import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for post-deploy smoke tests.
 *
 * Runs against live URLs (d.racku.la or count.racku.la) to verify
 * deployment succeeded and the app is working.
 *
 * Environment variables:
 * - SMOKE_TEST_URL: Target URL to test (default: https://d.racku.la)
 *
 * @example
 * # Test dev environment
 * npm run test:e2e:smoke
 *
 * # Test production
 * SMOKE_TEST_URL=https://count.racku.la npm run test:e2e:smoke
 */
export default defineConfig({
  // No webServer - we're testing a deployed URL
  testDir: "e2e",
  // Only run smoke tests - not the full E2E suite
  testMatch: "smoke.spec.ts",
  fullyParallel: true,
  // More retries for live environment
  retries: 2,
  // Longer timeouts for network latency
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.SMOKE_TEST_URL || "https://d.racku.la",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Only chromium for smoke tests - speed over coverage
  ],
});
