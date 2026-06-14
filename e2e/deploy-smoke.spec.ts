import { test, expect } from "./helpers/base-test";
import type { Page } from "@playwright/test";
import { gotoWithRack, locators, RACK_WITH_DEVICE_SHARE } from "./helpers";

/**
 * Post-deploy smoke tests.
 *
 * These verify a *live deployed* environment in a real browser, going beyond the
 * curl health check the deploy workflows previously relied on. They confirm the
 * deployed bundle actually boots and renders, not just that the server answers.
 *
 * Run against a deployed URL via the SMOKE_TEST_URL env var:
 *
 *   SMOKE_TEST_URL=https://d.racku.la npm run test:e2e:smoke
 *
 * The smoke config (playwright.smoke.config.ts) runs ONLY this spec in deploy
 * mode (SMOKE_TEST_URL set). The local-build smoke set (smoke.spec.ts,
 * basic-workflow.spec.ts) stays on the local preview server, where state-mutating
 * flows are safe. Deploy mode stays read-only and fast (chromium, under 30s).
 *
 * @see https://github.com/RackulaLives/Rackula/issues/1997
 */

/**
 * Collects unhandled page errors during a test. Production bundles can fail in
 * ways dev/unit runs never see (ESM chunk init order, minification), so a clean
 * boot is the core post-deploy signal.
 *
 * @param page - The Playwright page to monitor.
 * @returns An array that accumulates error messages as they occur.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("Post-deploy smoke", () => {
  test("app shell boots and renders at the root path", async ({ page }) => {
    const errors = collectPageErrors(page);

    // A brand-new visitor (no share link, no saved session) is the most faithful
    // post-deploy check: it exercises the real entry path of the deployed app.
    await page.goto("/");

    // The toolbar and canvas shell render unconditionally once Svelte mounts,
    // regardless of whether the start screen or a restored layout is shown. Their
    // presence proves the JS bundle loaded and the app initialised.
    await expect(page.locator(locators.toolbar.root)).toBeVisible();
    await expect(page.locator(locators.canvas.root)).toBeVisible();

    // First-time visitors land on the start screen; returning visitors restore a
    // saved layout (canvas shows a rack). Accept either to stay deployment-state
    // agnostic - both prove the app booted past the shell.
    await expect(
      page
        .locator(locators.startScreen.root)
        .or(page.locator(locators.rack.container).first()),
    ).toBeVisible();

    // eslint-disable-next-line no-restricted-syntax -- behavioral test: a clean production boot means zero uncaught errors
    expect(
      errors,
      `Deployed app threw JavaScript errors on load: ${errors.join("; ")}`,
    ).toHaveLength(0);
  });

  test("canvas renders a shared layout", async ({ page }) => {
    const errors = collectPageErrors(page);

    // Loading a self-contained share link forces the deployed app to decode and
    // render an actual rack, verifying the canvas works end to end without
    // depending on any saved session on the deployed environment.
    await gotoWithRack(page, RACK_WITH_DEVICE_SHARE);

    await expect(page.locator(locators.rack.container).first()).toBeVisible();
    await expect(page.locator(locators.rack.device).first()).toBeVisible();

    // eslint-disable-next-line no-restricted-syntax -- behavioral test: rendering a shared layout must not throw
    expect(
      errors,
      `Deployed app threw JavaScript errors while rendering a layout: ${errors.join("; ")}`,
    ).toHaveLength(0);
  });

  test("version endpoint reports a well-formed build", async ({ request }) => {
    // version.json is emitted at build time and served statically, so it proves
    // the deployed bundle is the one we expect without executing any JS.
    const response = await request.get("/version.json");
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      version?: unknown;
      commit?: unknown;
      buildTime?: unknown;
    };

    // version comes from package.json and is always present and non-empty.
    expect(typeof body.version).toBe("string");
    expect(body.version).not.toBe("");
    // commit may legitimately be an empty string in Docker builds (no .git), so
    // we assert only its type, not non-emptiness.
    expect(typeof body.commit).toBe("string");
    expect(typeof body.buildTime).toBe("string");
    // buildTime is an ISO timestamp; a valid parse guards against truncated or
    // placeholder values slipping through.
    expect(Date.parse(body.buildTime as string)).not.toBeNaN();
  });
});
