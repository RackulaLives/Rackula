/**
 * Layouts library logic
 *
 * Pure helpers backing the Layouts sidebar tab (#2082, #2325). The panel lists
 * the full library of saved layouts: open layouts (one per workspace tab) and
 * closed-but-saved layouts (in the library catalogue with no open tab). Open
 * rows carry their live name and rack/device counts from the tab; closed rows
 * carry the catalogue name and no counts (no body is loaded until opened).
 */

import type { WorkspaceTab, LibraryLayout } from "$lib/stores/workspace.svelte";

/** Placeholder shown when a layout has no name yet. */
export const UNTITLED_LAYOUT_NAME = "Untitled layout";

/** A single row in the Layouts library list. */
export interface LayoutRow {
  /**
   * Workspace tab id backing this row, when the layout is open. Null for a
   * closed row (no tab). Open rows key by tabId; closed rows key by layoutId.
   */
  tabId: string | null;
  /** Persisted layout id, when known (always set for closed rows). */
  layoutId: string | null;
  /** Display name, falling back to a placeholder when blank. */
  name: string;
  /** True when this is the active tab. */
  isActive: boolean;
  /** True when the layout is open in a tab. */
  isOpen: boolean;
  /** Number of racks in the layout. Zero for a closed row (body not loaded). */
  rackCount: number;
  /** Total devices across all racks. Zero for a closed row (body not loaded). */
  deviceCount: number;
}

/**
 * Build the library row list from the open tabs and the library catalogue.
 *
 * Open layouts come first, in tab order, so the panel and the tab strip stay in
 * sync; closed layouts (in the library with no open tab) follow. An open
 * layout that is also in the library renders once, as an open row, never as a
 * duplicate closed row. The active tab is flagged so the UI can highlight it
 * (paired with text, never colour-only).
 */
export function buildLayoutRows(
  tabs: readonly WorkspaceTab[],
  activeId: string,
  library: Readonly<Record<string, LibraryLayout>>,
): LayoutRow[] {
  const openLayoutIds = new Set<string>();
  const openRows: LayoutRow[] = tabs.map((tab) => {
    if (tab.layoutId) openLayoutIds.add(tab.layoutId);
    const { layout } = tab.store;
    const racks = layout.racks ?? [];
    const deviceCount = racks.reduce(
      (sum, rack) => sum + rack.devices.length,
      0,
    );
    return {
      tabId: tab.id,
      layoutId: tab.layoutId ?? null,
      name: layout.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: tab.id === activeId,
      isOpen: true,
      rackCount: racks.length,
      deviceCount,
    };
  });

  const closedRows: LayoutRow[] = Object.entries(library)
    .filter(([id]) => !openLayoutIds.has(id))
    .map(([id, entry]) => ({
      tabId: null,
      layoutId: id,
      name: entry.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: false,
      isOpen: false,
      rackCount: 0,
      deviceCount: 0,
    }));

  return [...openRows, ...closedRows];
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
