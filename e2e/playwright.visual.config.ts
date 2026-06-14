import { defineConfig, devices } from "@playwright/test";

import { VISUAL_VIEWPORT } from "./helpers/visual";

/**
 * Playwright configuration for the visual-regression suite (issue #2098).
 *
 * A tripwire: a small, stable set of screenshot snapshots of key UI states,
 * diffed in CI to catch unintended visual drift while the shell is rebuilt in
 * slices (epic #2017). Not pixel-perfect coverage.
 *
 * Baselines are platform-specific because font hinting and anti-aliasing differ
 * by OS. The committed baselines are generated on Linux (the CI runner). The
 * snapshot path is suffixed with {platform} so a local run on macOS or Windows
 * writes its own copies (which .gitignore excludes) and never clobbers the
 * committed Linux set. Regenerate Linux baselines with the "Update Visual
 * Snapshots" workflow; see docs/guides/TESTING.md.
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["visual-regression.spec.ts"],
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFileName}/{arg}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A retry would mask real flake in a deterministic diff suite. Keep it at 0.
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Freeze CSS animations/transitions and hide the text caret.
      animations: "disabled",
      caret: "hide",
      // Normalise device-pixel-ratio so a HiDPI runner matches a 1x one.
      scale: "css",
      // A tripwire, not pixel-perfect: tolerate sub-pixel AA noise but catch
      // real layout and colour drift.
      maxDiffPixelRatio: 0.01,
    },
  },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    viewport: { ...VISUAL_VIEWPORT },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "visual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { ...VISUAL_VIEWPORT },
        deviceScaleFactor: 1,
      },
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
