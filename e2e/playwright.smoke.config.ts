import { defineConfig, devices } from "@playwright/test";

const smokeTestUrl = process.env.SMOKE_TEST_URL;

/**
 * Playwright configuration for smoke tests.
 *
 * Two modes:
 * - Local mode (no SMOKE_TEST_URL): builds locally, serves on port 4173, and runs
 *   the local-build smoke set (smoke.spec.ts, basic-workflow.spec.ts). These
 *   exercise full UI flows, including state-mutating drag-and-drop, which is safe
 *   against a throwaway local server.
 * - Deploy mode (SMOKE_TEST_URL set): tests against a live URL and runs ONLY the
 *   post-deploy smoke set (deploy-smoke.spec.ts). These are read-only and fast:
 *   they verify the deployed bundle boots, renders, and serves a well-formed
 *   version endpoint, without mutating state on a live environment.
 *
 * @example
 * # Local/CI smoke tests (local build)
 * npm run test:e2e:smoke
 *
 * # Post-deploy smoke against a live URL
 * SMOKE_TEST_URL=https://d.racku.la npm run test:e2e:smoke
 */
export default defineConfig({
  testDir: ".",
  testMatch: smokeTestUrl
    ? ["deploy-smoke.spec.ts"]
    : ["smoke.spec.ts", "basic-workflow.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  // Smoke is single-shard, so no blob reporter. The github reporter annotates
  // PRs with failure locations in CI; list shows live progress locally.
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
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
          cwd: "..",
        },
      }),
});
