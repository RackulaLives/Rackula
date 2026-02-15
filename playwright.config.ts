import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
  },
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: process.env.CI === "true" || process.env.CI === "1",
  retries: 2,
  reporter: [["html", { open: "never" }]],
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
