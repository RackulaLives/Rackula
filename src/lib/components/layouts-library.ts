/**
 * Layouts library logic
 *
 * Pure helpers backing the Layouts sidebar tab (#2082, #2325). The panel lists
 * the full library of saved layouts: open layouts (one per workspace tab) and
 * closed-but-saved layouts (in the library catalogue with no open tab). Open
 * rows carry their live name and rack/device counts from the tab; closed rows
 * carry the catalogue name and no counts (no body is loaded until opened).
 */

import type { WorkspaceTab } from "$lib/stores/workspace.svelte";

/** Placeholder shown when a layout has no name yet. */
export const UNTITLED_LAYOUT_NAME = "Untitled layout";

/**
 * One catalogue row's source data, independent of where the catalogue came
 * from: the browser workspace index or the server's layout list (#3151).
 */
export interface CatalogueEntry {
  id: string;
  name: string;
  /** Rack count, when the source knows it. The server list supplies it. */
  rackCount?: number;
  /** Device count, when the source knows it. The server list supplies it. */
  deviceCount?: number;
  /** False when the stored YAML is corrupted. Server catalogue only. */
  valid?: boolean;
}

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
  /** False only for a corrupted server layout, which cannot be opened. */
  valid: boolean;
}

/**
 * Build the library row list from the open tabs and a catalogue of saved
 * layouts.
 *
 * Open layouts come first, in tab order, so the panel and the tab strip stay in
 * sync; closed layouts (in the catalogue with no open tab) follow. An open
 * layout that is also in the catalogue renders once, as an open row, never as a
 * duplicate closed row. The active tab is flagged so the UI can highlight it
 * (paired with text, never colour-only).
 *
 * `resolveOpenId` says how a tab names the catalogue entry it holds, because
 * the two modes differ (#3151). Browser mode passes `t => t.layoutId`: a
 * lazily-restored shell has no loaded body, so the tab record is the only
 * identity available. Server mode passes `t => t.store.layout.metadata?.id`:
 * no server load path sets `tab.layoutId`, and reading the live body means a
 * tab whose contents were replaced resolves to the layout it now holds rather
 * than a stale id.
 */
export function buildLayoutRows(
  tabs: readonly WorkspaceTab[],
  activeId: string,
  catalogue: readonly CatalogueEntry[],
  resolveOpenId: (tab: WorkspaceTab) => string | undefined,
): LayoutRow[] {
  const openLayoutIds = new Set<string>();
  const openRows: LayoutRow[] = tabs.map((tab) => {
    const openId = resolveOpenId(tab);
    if (openId) openLayoutIds.add(openId);
    const { layout } = tab.store;
    const racks = layout.racks ?? [];
    const deviceCount = racks.reduce(
      (sum, rack) => sum + rack.devices.length,
      0,
    );
    return {
      tabId: tab.id,
      layoutId: openId ?? null,
      name: layout.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: tab.id === activeId,
      isOpen: true,
      rackCount: racks.length,
      deviceCount,
      valid: true,
    };
  });

  const closedRows: LayoutRow[] = catalogue
    .filter((entry) => !openLayoutIds.has(entry.id))
    .map((entry) => ({
      tabId: null,
      layoutId: entry.id,
      name: entry.name.trim() || UNTITLED_LAYOUT_NAME,
      isActive: false,
      isOpen: false,
      rackCount: entry.rackCount ?? 0,
      deviceCount: entry.deviceCount ?? 0,
      valid: entry.valid ?? true,
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
