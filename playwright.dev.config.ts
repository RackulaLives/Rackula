import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for running E2E tests against the Vite dev server.
 *
 * Use this config during development for faster feedback loop:
 * - No build step required
 * - Uses Vite's HMR for quick iteration
 *
 * Note: Dev server uses native ESM (no chunking), so it won't catch
 * ESM initialization order bugs. Use the production config (playwright.config.ts)
 * to test bundled output.
 *
 * @example
 * npm run test:e2e:dev
 */
export default defineConfig({
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  testDir: "e2e",
  fullyParallel: true,
  retries: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Only chromium for dev - full browser matrix uses production config
  ],
});
