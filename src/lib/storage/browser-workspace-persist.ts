/**
 * Browser-mode workspace persistence (#2080).
 *
 * Writes the current open tab set and the active tab's body into the
 * multi-layout schema (#2179): the `Rackula:workspace` index records the
 * ordered open set, the active id, and a per-layout library entry; each
 * hydrated tab's body is written to `Rackula:layout:<id>`.
 *
 * Closing a tab is non-destructive: an id that leaves the open set keeps its
 * library entry and body so it can be reopened from the sidebar (spike #2179).
 * The library is the durable list, so entries are retained across persists, not
 * pruned when a tab closes.
 */

import type { Layout } from "$lib/types";
import {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
  saveLayoutBody,
  markEverHadLayouts,
  type LibraryEntry,
} from "./browser-workspace";

/** A tab snapshot for persistence. A shell has no layout body to write. */
export type PersistTab =
  | {
      layoutId: string;
      hydrated: true;
      layout: Layout;
      changesSinceExport: number;
      hasEverExported: boolean;
    }
  | {
      layoutId: string;
      hydrated: false;
      /** The shell's display name, kept in the library entry. */
      name: string;
    };

export interface PersistWorkspaceArgs {
  tabs: PersistTab[];
  activeLayoutId: string | null;
  /**
   * Twin-tab guard predicate (#2044): returns true when a layout's autosave is
   * paused because a foreign tab wrote its body. A paused layout's body is left
   * untouched so this tab cannot clobber the peer's copy; its index entry is
   * still written so the open set and shell names stay current.
   */
  isPaused?: (layoutId: string) => boolean;
  /**
   * Twin-tab guard lock wrapper (#2044): runs a single layout-body write under
   * that layout's per-layout Web Lock where available. Every hydrated body write
   * (not just the active one) goes through it, so a non-active layout body is
   * still serialised against a peer tab editing that same layout. Omitted on the
   * synchronous pagehide path, where async work cannot be awaited.
   */
  withLayoutLock?: <T>(layoutId: string, write: () => T) => Promise<T>;
}

/**
 * Persist the current workspace. Idempotent: safe to call on every change.
 *
 * Returns a promise that resolves once every body write has run. When
 * `withLayoutLock` is supplied, each hydrated body write is taken under its own
 * per-layout lock; the index write that follows reflects the completed bodies.
 */
export async function persistBrowserWorkspace(
  args: PersistWorkspaceArgs,
): Promise<void> {
  const { tabs, activeLayoutId, isPaused, withLayoutLock } = args;

  // Write each hydrated body first. saveLayoutBody also refreshes that layout's
  // library entry in the index (updatedAt, durability); it returns false on
  // quota, leaving the in-memory copy intact and surfacing the flag via the
  // index. Shells have no body to write. A paused layout (twin-tab guard) is
  // skipped so a foreign peer's copy is never clobbered. Each write runs under
  // its own per-layout lock when one is supplied; the locks are distinct per
  // layout id so writing many bodies in this loop cannot nest the same lock.
  for (const tab of tabs) {
    if (tab.hydrated && !isPaused?.(tab.layoutId)) {
      const write = () =>
        saveLayoutBody(tab.layoutId, tab.layout, {
          changesSinceExport: tab.changesSinceExport,
          hasEverExported: tab.hasEverExported,
        });
      if (withLayoutLock) {
        await withLayoutLock(tab.layoutId, write);
      } else {
        write();
      }
    }
  }

  // Re-read the index after the body writes so hydrated entries are current,
  // then layer in shell entries (carrying the shell name so the tab still
  // renders next launch) and the final open set.
  const current = loadWorkspaceIndex();
  const library: Record<string, LibraryEntry> = current
    ? { ...current.library }
    : {};

  for (const tab of tabs) {
    const previous = library[tab.layoutId];
    if (tab.hydrated) {
      // A non-paused hydrated tab already wrote its library entry via
      // saveLayoutBody above, so it is current and left alone. A paused tab
      // (twin-tab guard) skipped its body write, so it has no fresh entry. Its
      // id is still in openTabs below; without a library entry loadWorkspaceIndex
      // would filter it out as dangling and drop the layout even though its body
      // survives. Carry forward the existing entry (or a default named from the
      // in-memory layout) so the paused tab survives a persist+reload round-trip.
      if (!isPaused?.(tab.layoutId) || previous) continue;
      library[tab.layoutId] = {
        name: tab.layout.name,
        updatedAt: "",
        changesSinceExport: tab.changesSinceExport,
        hasEverExported: tab.hasEverExported,
        writeFailed: false,
        storageMode: "browser",
      };
      continue;
    }
    library[tab.layoutId] = {
      name: tab.name,
      updatedAt: previous?.updatedAt ?? "",
      changesSinceExport: previous?.changesSinceExport ?? 0,
      hasEverExported: previous?.hasEverExported ?? false,
      writeFailed: previous?.writeFailed ?? false,
      storageMode: previous?.storageMode ?? "browser",
    };
  }

  saveWorkspaceIndex({
    schemaVersion: 2,
    activeId: activeLayoutId,
    openTabs: tabs.map((tab) => tab.layoutId),
    library,
  });

  if (tabs.length > 0) markEverHadLayouts();
}
