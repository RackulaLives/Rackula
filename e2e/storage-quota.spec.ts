import { test, expect } from "./helpers/base-test";
import { gotoWithRack, MEDIUM_RACK_SHARE } from "./helpers";

/**
 * #3375: when browser storage refuses a layout body, the app used to report
 * "Saved", write an index entry pointing at a body that was never stored, and
 * restore that layout next launch as an empty canvas wearing its name.
 *
 * The quota is injected rather than produced by filling localStorage for real:
 * the failure condition is identical (setItem throws QuotaExceededError for the
 * body key while the much smaller index write still fits), and injecting it
 * keeps the test deterministic instead of depending on the browser's exact
 * per-origin budget.
 */
async function refuseLayoutBodyWrites(
  page: Parameters<typeof gotoWithRack>[0],
) {
  await page.addInitScript(() => {
    const proto = Object.getPrototypeOf(localStorage) as Storage;
    const original = proto.setItem;
    proto.setItem = function (key: string, value: string) {
      if (key.startsWith("Rackula:layout:")) {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      }
      return original.call(this, key, value);
    };
  });
}

test.describe("browser storage quota", () => {
  test("reports the failure instead of Saved, and stores no phantom layout", async ({
    page,
  }) => {
    await refuseLayoutBodyWrites(page);
    await gotoWithRack(page, MEDIUM_RACK_SHARE);

    // Autosave is debounced by 1s; the toast is permanent once raised.
    const toast = page.getByTestId("toast-message").filter({
      hasText: /not saved/i,
    });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText(/export/i);

    // The chip must not claim the layout is saved.
    await expect(page.getByTestId("storage-status-chip")).not.toContainText(
      /^Saved$/,
    );

    // Nothing may point at a body that was never written.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("Rackula:workspace");
      const bodyKeys = Object.keys(localStorage).filter((k) =>
        k.startsWith("Rackula:layout:"),
      );
      return {
        index: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
        bodyKeys,
      };
    });
    expect(stored.bodyKeys).toEqual([]);
    const openTabs = (stored.index?.openTabs ?? []) as string[];
    expect(openTabs).toEqual([]);
  });

  test("does not restore an empty canvas wearing the layout's name", async ({
    page,
  }) => {
    await refuseLayoutBodyWrites(page);
    await gotoWithRack(page, MEDIUM_RACK_SHARE);
    await expect(
      page.getByTestId("toast-message").filter({ hasText: /not saved/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Reload without the share link: whatever comes back is what storage held.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The layout was never persisted, so nothing may come back wearing its
    // name. Starting fresh is the honest outcome; restoring "Medium Test
    // Layout" over an empty canvas is the bug.
    const restored = await page.evaluate(() => {
      const raw = localStorage.getItem("Rackula:workspace");
      return {
        bodyKeys: Object.keys(localStorage).filter((k) =>
          k.startsWith("Rackula:layout:"),
        ),
        index: raw
          ? (JSON.parse(raw) as { library?: Record<string, unknown> })
          : null,
      };
    });
    expect(restored.bodyKeys).toEqual([]);
    expect(Object.keys(restored.index?.library ?? {})).toEqual([]);
    await expect(page.locator("body")).not.toContainText("Medium Test Layout");
  });
});
