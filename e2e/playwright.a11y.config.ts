import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the axe-core accessibility suite (issue #2099).
 *
 * A guard rail for epic #2017: runs axe-core against the key surfaces and fails
 * CI on any WCAG 2.2 AA violation. Kept separate from the main E2E config so the
 * scans can be run and gated on their own, and so a layout regression in the
 * functional suite does not hide an accessibility regression (or vice versa).
 *
 * Chromium only: axe-core results do not vary by browser engine (the rules
 * inspect the DOM and computed styles, not engine quirks), so one browser is
 * enough and keeps the job fast. No retries: an axe violation is deterministic,
 * so a retry would only mask real flake elsewhere in the harness.
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["axe.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    cwd: "..",
  },
});
