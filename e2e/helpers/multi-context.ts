/**
 * Multi-context helpers for the M14 shell (issue #2183).
 *
 * The tab strip (#2079) makes Rackula a multi-layout workspace, and two shell
 * features need more than one page open at once:
 *
 * - Twin-tab guard (#2044): two browser tabs on the same origin hold the same
 *   working copy. The guard elects one editor per layout (a Web Lock keyed by
 *   layout id) and pauses the others. Testing it needs two pages that share
 *   localStorage and can observe each other's `storage` events.
 * - Lazy tab restore (#2080): launch restores the open-tab set from the
 *   `Rackula:workspace` index, hydrating only the active tab. Testing the
 *   restore path needs a first page to seed the workspace index, then a second
 *   page (same origin) that reads it on launch.
 *
 * Both rely on a single fact about browser storage: pages in the SAME
 * Playwright BrowserContext share an origin, so they share localStorage and
 * receive each other's `storage` events. Pages in DIFFERENT contexts are
 * isolated and only share state through an explicit `storageState` snapshot.
 *
 * These helpers wrap the same-context case, which is what #2044 and #2080 need.
 * They are deliberately thin: the shell features they support are not built
 * yet, so this provides the harness primitive without simulating behaviour that
 * does not exist. When #2044/#2080 land, their specs compose these helpers.
 */
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Open a second page in the same browser context as an existing page.
 *
 * The new page shares localStorage and `storage` events with `page`, the
 * arrangement the twin-tab guard (#2044) elects an editor across. Returns the
 * new page; the caller navigates it (e.g. with `gotoWithRack`).
 *
 * @example
 *   const tabB = await openSecondTab(page);
 *   await gotoWithRack(tabB);
 *   // tabB now shares the workspace index with `page`
 */
export async function openSecondTab(page: Page): Promise<Page> {
  return page.context().newPage();
}

/**
 * Read a single localStorage key from a page as a parsed JSON value.
 *
 * Returns `null` when the key is absent or does not parse as JSON. Use this to
 * assert that a write in one tab is visible to another (both must be in the same
 * context). The workspace index lives at `Rackula:workspace` and layout bodies
 * at `Rackula:layout:<id>` (spike #2179).
 */
export async function readStorageJson<T = unknown>(
  page: Page,
  key: string,
): Promise<T | null> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }, key) as Promise<T | null>;
}

/**
 * Capture the `storage` events a page receives while `action` runs.
 *
 * The twin-tab guard reacts to cross-tab `storage` events, so a test for it
 * asserts that writing in one tab fires a `storage` event in the other. This
 * installs a listener on `observer`, runs `action` (typically a write in a
 * different tab in the same context), then resolves with the keys that changed.
 *
 * @param observer - The page expected to receive the events
 * @param action - The work that triggers a cross-tab write
 * @param options.timeout - How long to wait for events, default 2000ms
 * @returns The localStorage keys reported by `storage` events during `action`
 */
export async function collectStorageEvents(
  observer: Page,
  action: () => Promise<void>,
  options?: { timeout?: number },
): Promise<string[]> {
  const timeout = options?.timeout ?? 2000;

  await observer.evaluate(() => {
    const w = window as unknown as { __rackulaStorageKeys?: string[] };
    w.__rackulaStorageKeys = [];
    w.addEventListener("storage", (event) => {
      if (event.key !== null) w.__rackulaStorageKeys?.push(event.key);
    });
  });

  await action();
  await observer.waitForTimeout(timeout);

  return observer.evaluate(() => {
    const w = window as unknown as { __rackulaStorageKeys?: string[] };
    return w.__rackulaStorageKeys ?? [];
  });
}

/**
 * Snapshot a context's storage state for cross-context restore tests.
 *
 * Lazy restore (#2080) and a fresh launch read the workspace index at startup.
 * To test "reopen the app and restore the tabs", seed state in one context,
 * snapshot it here, then create a NEW context with that snapshot. A new context
 * (rather than a new page) models a genuine relaunch: it starts cold and reads
 * the restored index, instead of inheriting a live in-memory workspace.
 *
 * @example
 *   const state = await snapshotStorage(page.context());
 *   const restored = await browser.newContext({ storageState: state });
 *   const relaunched = await restored.newPage();
 *   await relaunched.goto("/");
 */
export async function snapshotStorage(
  context: BrowserContext,
): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
  return context.storageState();
}
