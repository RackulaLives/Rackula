/**
 * Layouts library logic
 *
 * Pure helpers backing the Layouts sidebar tab (#2082). The library lists the
 * layouts the user is working with. For this slice the source of truth is the
 * workspace store's OPEN set (one tab per open layout, #2079); the durable
 * browser-mode library of every saved layout depends on the multi-layout
 * storage schema (#2179/#2080), which does not exist yet, so it is out of
 * scope here.
 */

import type { WorkspaceTab } from "$lib/stores/workspace.svelte";

/** Placeholder shown when a layout has no name yet. */
export const UNTITLED_LAYOUT_NAME = "Untitled layout";

/** A single row in the Layouts library list. */
export interface LayoutRow {
  /** Workspace tab id backing this row (stable identity for actions). */
  tabId: string;
  /** Display name, falling back to a placeholder when blank. */
  name: string;
  /** True when this is the active tab. */
  isActive: boolean;
  /** True when the layout is open in a tab (always true for this slice). */
  isOpen: boolean;
  /** Number of racks in the layout. */
  rackCount: number;
  /** Total number of devices across all racks. */
  deviceCount: number;
}

/**
 * Build the library row list from the workspace's open tabs.
 *
 * Row order follows tab order so the list and the tab strip stay in sync. The
 * active tab is flagged so the UI can highlight it (paired with text, never
 * colour-only).
 */
export function buildLayoutRows(
  tabs: readonly WorkspaceTab[],
  activeId: string,
): LayoutRow[] {
  return tabs.map((tab) => {
    const { layout } = tab.store;
    const racks = layout.racks ?? [];
    const deviceCount = racks.reduce(
      (sum, rack) => sum + rack.devices.length,
      0,
    );
    return {
      tabId: tab.id,
      name: layout.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: tab.id === activeId,
      isOpen: true,
      rackCount: racks.length,
      deviceCount,
    };
  });
}

/**
 * Derive a non-colliding name for a duplicated layout.
 *
 * The first copy is "<base> Copy"; further copies are numbered
 * ("<base> Copy 2", "<base> Copy 3", ...). Collision checks are
 * case-insensitive so a duplicate never silently shadows an existing name.
 */
export function nextDuplicateName(
  existingNames: readonly string[],
  baseName: string,
): string {
  const base = baseName.trim() || UNTITLED_LAYOUT_NAME;
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const first = `${base} Copy`;
  if (!taken.has(first.toLowerCase())) {
    return first;
  }
  let n = 2;
  while (taken.has(`${first} ${n}`.toLowerCase())) {
    n += 1;
  }
  return `${first} ${n}`;
}
