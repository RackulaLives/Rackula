import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the README media capture. Not a test suite: it
 * writes media-out/ for scripts/encode-hero.sh and the Update README Media
 * workflow. Shots run one at a time so a slow runner cannot starve the capture.
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["readme-media/capture.media.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:4173",
    viewport: { width: 1120, height: 700 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run build && npm run preview",
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    cwd: "..",
  },
});
