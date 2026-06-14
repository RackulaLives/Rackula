/**
 * Multi-context harness smoke tests (issue #2183).
 *
 * Proves the primitive the twin-tab guard (#2044) and lazy tab restore (#2080)
 * build on: two pages in the same browser context share localStorage and see
 * each other's `storage` events, and a fresh context restores from a storage
 * snapshot. The shell features themselves are not built yet, so these tests
 * cover the harness, not the guard or the restore flow. When #2044/#2080 land,
 * their specs compose the same helpers.
 *
 * @see docs/research/spike-2183-e2e-shell-strategy.md
 */
import { test } from "./helpers/base-test";
import { expect } from "@playwright/test";
import {
  gotoWithRack,
  openSecondTab,
  readStorageJson,
  collectStorageEvents,
  snapshotStorage,
} from "./helpers";

const AUTOSAVE_KEY = "Rackula:autosave";

test.describe("multi-context harness", () => {
  test("two tabs in one context share the autosave slot", async ({ page }) => {
    // Tab A loads a rack; the app autosaves it to localStorage.
    await gotoWithRack(page);
    await expect
      .poll(() => readStorageJson(page, AUTOSAVE_KEY))
      .not.toBeNull();

    // Tab B opens in the same context and reads the same slot without loading
    // a layout of its own, the shared-origin fact #2044's editor election needs.
    const tabB = await openSecondTab(page);
    await tabB.goto("/");
    const sharedFromB = await readStorageJson(tabB, AUTOSAVE_KEY);
    expect(sharedFromB).not.toBeNull();
  });

  test("a write in one tab fires a storage event in another", async ({
    page,
  }) => {
    await gotoWithRack(page);
    const observer = await openSecondTab(page);
    await observer.goto("/");

    // Writing in `page` must reach `observer` as a `storage` event: this is the
    // signal the twin-tab guard (#2044) reacts to across tabs.
    const changedKeys = await collectStorageEvents(observer, async () => {
      await page.evaluate((key) => {
        window.localStorage.setItem(key, JSON.stringify({ ping: Date.now() }));
      }, "Rackula:twin-tab-probe");
    });

    expect(changedKeys).toContain("Rackula:twin-tab-probe");
  });

  test("a fresh context restores from a storage snapshot", async ({
    page,
    browser,
  }) => {
    // Seed state in the first context, then relaunch cold from a snapshot, the
    // shape lazy restore (#2080) reads its open-tab set from at startup.
    await gotoWithRack(page);
    await expect
      .poll(() => readStorageJson(page, AUTOSAVE_KEY))
      .not.toBeNull();

    const state = await snapshotStorage(page.context());
    const restoredContext = await browser.newContext({ storageState: state });
    try {
      const relaunched = await restoredContext.newPage();
      await relaunched.goto("/");
      const restored = await readStorageJson(relaunched, AUTOSAVE_KEY);
      expect(restored).not.toBeNull();
    } finally {
      await restoredContext.close();
    }
  });
});
