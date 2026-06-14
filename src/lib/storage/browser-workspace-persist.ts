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
}

/**
 * Persist the current workspace. Idempotent: safe to call on every change.
 */
export function persistBrowserWorkspace(args: PersistWorkspaceArgs): void {
  const { tabs, activeLayoutId } = args;

  // Write each hydrated body first. saveLayoutBody also refreshes that layout's
  // library entry in the index (updatedAt, durability); it returns false on
  // quota, leaving the in-memory copy intact and surfacing the flag via the
  // index. Shells have no body to write.
  for (const tab of tabs) {
    if (tab.hydrated) {
      saveLayoutBody(tab.layoutId, tab.layout, {
        changesSinceExport: tab.changesSinceExport,
        hasEverExported: tab.hasEverExported,
      });
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
    if (tab.hydrated) continue;
    const previous = library[tab.layoutId];
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
