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
    // regardless of whether the empty state or a restored layout is shown. Their
    // presence proves the JS bundle loaded and the app initialised.
    await expect(page.locator(locators.toolbar.root)).toBeVisible();
    await expect(page.locator(locators.canvas.root)).toBeVisible();

    // First-time visitors land in a default layout with one rack in browser mode
    // (#2831), or on the inline "Add a rack" affordance when a server deployment
    // starts empty; returning visitors restore a saved layout (a rack). Accept
    // any of these to stay deployment-state agnostic - all prove the app booted
    // past the shell.
    await expect(
      page
        .locator(locators.canvas.addRackAffordance)
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

  test("version endpoint reports a well-formed build", async ({ page }) => {
    // version.json is emitted at build time and served statically, so it proves
    // the deployed bundle is the one we expect without executing any JS.
    //
    // Fetched through `page.request`, not the standalone `request` fixture, and
    // only AFTER a navigation. Cloudflare serves a Managed Challenge to
    // datacenter IPs across the racku.la zone, and Bot Fight Mode cannot be
    // skipped by a WAF rule on the Free plan. A bare API request runs no JS, so
    // it cannot solve the challenge and receives a 403 challenge page --
    // `response.ok()` is then false and the check reports a healthy deploy as
    // broken. That is exactly what happened: this workflow failed 79 out of 79
    // runs from 2026-07-20 onward, including before the August outage.
    //
    // Navigating first lets Chromium solve the challenge and earn a clearance
    // cookie; `page.request` shares the browser context's cookie jar, so the
    // request that follows carries that clearance and is not challenged.
    await page.goto("/");
    const response = await page.request.get("/version.json");
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

    // When the deploy workflow tells us which build it just promoted, assert
    // that this is the one actually being served. Without this the check only
    // proves *a* build is live, not the right one -- a deploy that silently
    // failed to promote would still pass. The commit is the real discriminator:
    // a re-deploy of the same tag shares its version but not its commit.
    // Absent for the scheduled soak, which has no expectation to compare to.
    const expectedVersion = process.env.EXPECT_VERSION;
    if (expectedVersion) {
      expect(body.version).toBe(expectedVersion);
    }
    const expectedCommit = process.env.EXPECT_COMMIT;
    if (expectedCommit) {
      expect(body.commit).toBe(expectedCommit);
    }
  });

  test("security headers are present by value on the deployed origin", async ({
    page,
  }) => {
    // Verifies headers on the LIVE origin, which a curl-based check cannot do
    // from CI (see the challenge note above). This is not redundant with the
    // curl smoke that runs against the preview URL: that surface is on
    // workers.dev and cannot observe zone-level interference. Exactly that bit
    // mattered once already -- a zone setting was rewriting HSTS to max-age=0
    // on every racku.la hostname while the same Worker served the correct value
    // on workers.dev (#3214).
    await page.goto("/");
    const response = await page.request.get("/");
    expect(response.ok()).toBe(true);
    const headers = response.headers();

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self'");
    // The whole point of the policy: no inline script execution. Asserted on
    // the script-src directive specifically, since style-src legitimately
    // carries 'unsafe-inline' for Svelte's scoped styles.
    const scriptSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc ?? "").not.toContain("unsafe-inline");

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    // Deployed surfaces are HTTPS, so HSTS must be both present and non-zero.
    // `max-age=0` is what a zone-level override looked like in #3214.
    const hsts = headers["strict-transport-security"] ?? "";
    expect(hsts).toMatch(/max-age=\d+/);
    expect(hsts).not.toMatch(/max-age=0\b/);
  });
});
