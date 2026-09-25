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

function formatStoredAt(iso: string): string | null {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The launch notice for layouts whose last write in a previous session was
 * refused (#3386), or null when none were. Such a layout still loads its older
 * body, so it is durable as loaded and the storage chip rightly reports no
 * error; this notice is the only place the lost edits are mentioned. It reads
 * the persisted `writeFailed` flag, never this session's failure map, and the
 * flag clears on the layout's next successful save, so it does not repeat.
 */
export function previousSessionUnsavedNotice(
  index: WorkspaceIndex,
): string | null {
  // Open tabs only: a closed layout is not shown, and nothing saves it until
  // it is reopened, so naming it would repeat on every launch.
  const ids = [...new Set(index.openTabs)].filter(
    (id) => index.library[id]?.writeFailed,
  );
  if (ids.length === 0) return null;

  const named =
    index.activeId && ids.includes(index.activeId) ? index.activeId : ids[0]!;
  const entry = index.library[named]!;
  const storedAt = formatStoredAt(entry.updatedAt);
  const version = storedAt
    ? `Its last stored version, from ${storedAt}, is shown instead.`
    : "Its last stored version is shown instead.";
  const others = ids.length - 1;
  const remainder =
    others > 0
      ? ` Changes to ${others} other ${others === 1 ? "layout" : "layouts"} could not be saved either.`
      : "";

  return `Changes to "${entry.name}" from a previous session could not be saved. ${version}${remainder}`;
}
