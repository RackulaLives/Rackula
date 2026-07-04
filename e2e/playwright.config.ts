import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
    timeout: 120_000,
    cwd: "..",
  },
  testDir: ".",
  fullyParallel: true,
  // Honour PW_WORKERS (set by the self-hosted e2e runner) so the pve-prod host
  // parallelises the full suite; guard against a non-numeric/zero value
  // (Number("x") -> NaN), else fall back to Playwright's default.
  workers: ((n) => (Number.isFinite(n) && n > 0 ? n : undefined))(
    Number(process.env.PW_WORKERS),
  ),
  forbidOnly: !!process.env.CI,
  retries: 1,
  // CI uses the blob reporter so sharded runs (test-full.yml) can be merged
  // into a single HTML report with `npx playwright merge-reports`. The github
  // reporter annotates PRs with failure locations; list shows live progress
  // locally.
  reporter: process.env.CI
    ? [["github"], ["blob"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // visual-regression.spec.ts and axe.spec.ts have their own configs
      // (playwright.visual.config.ts, playwright.a11y.config.ts).
      // deploy-smoke.spec.ts is a live-URL boot check (playwright.smoke.config.ts
      // in deploy mode); against the local preview it is redundant with the
      // flows this suite already runs, so it is excluded here.
      testIgnore: [
        "**/ios-safari.spec.ts",
        "**/android-chrome.spec.ts",
        "**/visual-regression.spec.ts",
        "**/axe.spec.ts",
        "**/deploy-smoke.spec.ts",
      ],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: [
        "**/ios-safari.spec.ts",
        "**/android-chrome.spec.ts",
        "**/visual-regression.spec.ts",
        "**/axe.spec.ts",
        "**/deploy-smoke.spec.ts",
      ],
    },
    // iOS Safari tests
    {
      name: "ios-safari",
      use: {
        ...devices["iPhone 14"],
      },
      testMatch: "**/ios-safari.spec.ts",
    },
    {
      name: "ipad",
      use: {
        ...devices["iPad Pro 11"],
      },
      testMatch: "**/ios-safari.spec.ts",
    },
    // Android Chrome tests
    {
      name: "android-chrome",
      use: {
        ...devices["Pixel 7"],
      },
      testMatch: "**/android-chrome.spec.ts",
    },
    {
      name: "android-tablet",
      use: {
        ...devices["Galaxy Tab S4"],
      },
      testMatch: "**/android-chrome.spec.ts",
    },
  ],
});
