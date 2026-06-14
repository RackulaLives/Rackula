/**
 * Browser-mode launch resolution (#2080).
 *
 * Decides what the app does on launch in browser mode by reading the persisted
 * multi-layout workspace (#2179): adopt a legacy single autosave once, then
 * either restore the open tab set lazily or open the empty state. The decision
 * is a pure read over storage so it can be unit tested without mounting the app.
 */

import {
  loadWorkspaceIndex,
  adoptLegacyAutosave,
  loadLayoutBody,
  hasEverHadLayouts,
  type WorkspaceIndex,
  type LayoutBodyResult,
} from "./browser-workspace";

/**
 * Restore the persisted open tab set. `index` is read synchronously to paint
 * tab shells; `loadBody` is the lazy body reader handed to the workspace store.
 */
export interface RestoreLaunch {
  action: "restore";
  index: WorkspaceIndex;
  loadBody: (id: string) => LayoutBodyResult;
}

/**
 * Open the canvas empty state. `everHadLayouts` distinguishes a returning user
 * whose data is gone (lost-data-empty) from a genuine fresh install
 * (fresh-install-empty); the empty-state UI (#2095/#2018) reads this.
 */
export interface EmptyLaunch {
  action: "empty";
  everHadLayouts: boolean;
}

export type BrowserLaunch = RestoreLaunch | EmptyLaunch;

/**
 * Resolve the browser-mode launch action. Adopts a legacy autosave once when no
 * workspace exists, then restores when there are open tabs, else opens empty.
 */
export function resolveBrowserLaunch(): BrowserLaunch {
  // One-time migration off the legacy single slot. No-op when a workspace index
  // already exists or there is nothing to adopt.
  adoptLegacyAutosave();

  const index = loadWorkspaceIndex();
  if (index && index.openTabs.length > 0) {
    return { action: "restore", index, loadBody: loadLayoutBody };
  }

  return { action: "empty", everHadLayouts: hasEverHadLayouts() };
}
