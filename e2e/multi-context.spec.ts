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
  locators,
} from "./helpers";

// The browser multi-layout workspace index (#2080/#2179). The open-set lives
// here; layout bodies live under Rackula:layout:<id>.
const WORKSPACE_KEY = "Rackula:workspace";

test.describe("multi-context harness", () => {
  test("two tabs in one context share the workspace index", async ({
    page,
  }) => {
    // Tab A loads a rack; the app autosaves the workspace to localStorage.
    await gotoWithRack(page);
    await expect
      .poll(() => readStorageJson(page, WORKSPACE_KEY))
      .not.toBeNull();

    // Tab B opens in the same context and reads the same index without loading
    // a layout of its own, the shared-origin fact #2044's editor election needs.
    const tabB = await openSecondTab(page);
    await tabB.goto("/");
    const sharedFromB = await readStorageJson(tabB, WORKSPACE_KEY);
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
      .poll(() => readStorageJson(page, WORKSPACE_KEY))
      .not.toBeNull();

    const state = await snapshotStorage(page.context());
    const restoredContext = await browser.newContext({ storageState: state });
    try {
      const relaunched = await restoredContext.newPage();
      await relaunched.goto("/");
      const restored = await readStorageJson(relaunched, WORKSPACE_KEY);
      expect(restored).not.toBeNull();
    } finally {
      await restoredContext.close();
    }
  });

  test("a cold relaunch restores the open layout to the canvas (#2080)", async ({
    page,
    browser,
  }) => {
    // Seed a workspace with an open rack, wait for the debounced workspace save
    // to land its body, then snapshot.
    await gotoWithRack(page);
    await expect
      .poll(() => readStorageJson(page, WORKSPACE_KEY))
      .not.toBeNull();

    const state = await snapshotStorage(page.context());
    const restoredContext = await browser.newContext({ storageState: state });
    try {
      // A cold relaunch (new context, no live in-memory workspace) must restore
      // the open tab from the index and hydrate it onto the canvas, not show the
      // empty state.
      const relaunched = await restoredContext.newPage();
      await relaunched.goto("/");
      await expect(
        relaunched.locator(locators.rack.container).first(),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await restoredContext.close();
    }
  });
});
