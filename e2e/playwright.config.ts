import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
    cwd: "..",
  },
  testDir: ".",
  fullyParallel: true,
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
      testIgnore: ["**/ios-safari.spec.ts", "**/android-chrome.spec.ts"],
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testIgnore: ["**/ios-safari.spec.ts", "**/android-chrome.spec.ts"],
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
