/**
 * Layout tabs logic
 *
 * Pure helpers backing the layout tab strip folded into the toolbar (#2324).
 * The strip lists the open layouts as tabs in the centre lane. When the tabs
 * do not all fit, the overflow ones collapse behind a chevron with a
 * hidden-count badge; the active tab is always kept visible.
 *
 * Measuring how many tabs fit is the component's job (a ResizeObserver on the
 * centre lane feeds the available width); deciding which tabs are visible from
 * that width is this module's job, so the partition is testable in isolation.
 */

/** One tab's identity for partitioning. Only the id is needed here. */
export interface PartitionTab {
  id: string;
}

/** The visible/hidden split of the tab strip for a given available width. */
export interface TabPartition<T extends PartitionTab> {
  /** Tabs rendered inline, in tab order. Always includes the active tab. */
  visible: T[];
  /** Tabs collapsed behind the overflow chevron, in tab order. */
  hidden: T[];
}

/**
 * Partition tabs into a visible set and a hidden (overflow) set for a given
 * available width.
 *
 * Rules:
 * - The active tab is ALWAYS visible, no matter how narrow the lane is.
 * - As many other tabs as fit are shown, in tab order; the rest overflow.
 * - `hidden.length` always equals `tabs.length - visible.length`.
 *
 * Widths are in pixels. `availableWidth` is the usable width of the centre
 * lane after the persistent controls (the new-layout "+" and, when anything
 * overflows, the chevron) have been reserved by the caller. `tabWidth` is the
 * width one tab occupies including its gap. A non-positive `tabWidth` (or an
 * empty list) yields just the active tab visible, everything else hidden, so
 * the strip never collapses to nothing.
 */
export function partitionTabs<T extends PartitionTab>(
  tabs: readonly T[],
  activeId: string,
  availableWidth: number,
  tabWidth: number,
): TabPartition<T> {
  if (tabs.length === 0) {
    return { visible: [], hidden: [] };
  }

  const activeIndex = tabs.findIndex((t) => t.id === activeId);
  // An unknown active id falls back to the first tab so one tab is always
  // pinned and the function never returns an empty visible set.
  const pinnedIndex = activeIndex === -1 ? 0 : activeIndex;

  // How many tabs fit at this width. The active tab is always one of them, so
  // the floor is 1 even when the lane is narrower than a single tab.
  const fitCount =
    tabWidth > 0 ? Math.max(1, Math.floor(availableWidth / tabWidth)) : 1;

  if (fitCount >= tabs.length) {
    return { visible: [...tabs], hidden: [] };
  }

  // Keep the pinned (active) tab plus the first `fitCount` tabs in order. If
  // the pinned tab is past that window, it displaces the last otherwise-visible
  // tab so the visible count stays at `fitCount` and the active tab stays shown.
  const visibleIndices = new Set<number>();
  for (let i = 0; i < fitCount; i += 1) visibleIndices.add(i);
  if (!visibleIndices.has(pinnedIndex)) {
    visibleIndices.delete(fitCount - 1);
    visibleIndices.add(pinnedIndex);
  }

  const visible: T[] = [];
  const hidden: T[] = [];
  tabs.forEach((tab, index) => {
    if (visibleIndices.has(index)) visible.push(tab);
    else hidden.push(tab);
  });

  return { visible, hidden };
}

/**
 * Whether a tab exposes a close affordance.
 *
 * The workspace must always have an active layout, so the close control is
 * hidden on the sole remaining tab; closing any other tab removes it from the
 * open set without deleting the layout from the library.
 */
export function tabHasClose(openTabCount: number): boolean {
  return openTabCount > 1;
}
