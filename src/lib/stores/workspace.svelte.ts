/**
 * Workspace Store
 *
 * Owns the set of layouts open as tabs. Each tab holds its own LayoutStore
 * instance, and therefore its own undo/redo history. The active tab's store is
 * the one live store the rest of the app reads through getLayoutStore().
 *
 * History model (spike #2182):
 * - History is per layout-store instance. The active tab's history is the only
 *   live history; there is no global cross-tab undo stack.
 * - Switching tabs is a PURE focus change: no history-stack mutation. An
 *   inactive tab's undo and redo stacks freeze exactly as the user left them,
 *   so returning to a tab resumes its own history, including redo.
 * - Every content swap into a tab (open, restore) goes through one
 *   clear-then-load primitive that clears that tab's history first.
 *
 * Persistence: tabs are in-memory session state here. The browser-mode
 * multi-layout storage schema (spike #2179: `Rackula:workspace` index +
 * `Rackula:layout:<id>` bodies) is a separate slice (#2080) that layers onto
 * this store; it is intentionally not built here.
 */

import type { Layout } from "$lib/types";
import {
  createLayoutStore,
  type LayoutStore,
} from "./layout.svelte";
import {
  createHistoryStore,
  getHistoryStore,
} from "./history.svelte";

/** A single open tab: a stable id plus the layout store backing it. */
export interface WorkspaceTab {
  /** Stable identity for the tab, independent of the layout's metadata id. */
  id: string;
  /** The layout store instance backing this tab (owns its own history). */
  store: LayoutStore;
}

let tabIdCounter = 0;
function nextTabId(): string {
  tabIdCounter += 1;
  return `tab-${tabIdCounter}`;
}

/**
 * Create a workspace store instance.
 *
 * The first tab wraps a layout store bound to the app-session history
 * singleton (getHistoryStore()), so existing call sites that read
 * getLayoutStore()/getHistoryStore() see the same instance and history they
 * always have. Tabs opened afterwards get their own fresh history instance.
 */
export function createWorkspaceStore() {
  function createInitialTab(): WorkspaceTab {
    // The first/fresh tab binds to the app-session history singleton. We do NOT
    // clear here: lazy construction of the workspace can be triggered from
    // inside a reactive read (a $derived), and clearing $state there throws
    // state_unsafe_mutation. Cold start has empty history anyway. The paths that
    // REPLACE an existing tab with a fresh one (closeLastTab, reset) clear the
    // singleton explicitly, outside any reactive context.
    return { id: nextTabId(), store: createLayoutStore(getHistoryStore()) };
  }

  const firstTab = createInitialTab();
  let tabs = $state<WorkspaceTab[]>([firstTab]);
  let activeId = $state<string>(firstTab.id);

  const activeTab = $derived(
    tabs.find((t) => t.id === activeId) ?? tabs[0]!,
  );
  const activeStore = $derived(activeTab.store);

  function getTab(id: string): WorkspaceTab | undefined {
    return tabs.find((t) => t.id === id);
  }

  /**
   * Open a new tab backed by a fresh layout store (its own history) and make
   * it active. The layout, when provided, is loaded through the shared
   * clear-then-load path so the new tab starts with empty history.
   * @returns the new tab's id
   */
  function openTab(layout?: Layout): string {
    const tab: WorkspaceTab = {
      id: nextTabId(),
      store: createLayoutStore(createHistoryStore()),
    };
    tabs = [...tabs, tab];
    activeId = tab.id;
    if (layout) {
      // loadLayout already clears this instance's history (clear-then-load).
      tab.store.loadLayout(layout);
    }
    return tab.id;
  }

  /**
   * Focus a tab. Pure focus change: no history mutation on either the outgoing
   * or incoming tab, so each tab's undo/redo stacks survive a round trip.
   */
  function switchTo(id: string): void {
    if (!getTab(id)) return;
    activeId = id;
  }

  /**
   * Close a tab. Closing keeps the underlying layout (no body is destroyed
   * here; persistence is a separate slice). If the closed tab was active,
   * focus falls back to the nearest neighbour. The workspace never goes empty:
   * closing the only tab resets it to a fresh blank tab.
   */
  function closeTab(id: string): void {
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    if (tabs.length === 1) {
      // Replacing the only tab with a fresh blank one: clear the singleton
      // history the fresh tab binds to, so it does not inherit the closed
      // tab's undo/redo stack. Safe to mutate state here (event-handler path,
      // not a reactive read).
      getHistoryStore().clear();
      const fresh = createInitialTab();
      tabs = [fresh];
      activeId = fresh.id;
      return;
    }

    const wasActive = activeId === id;
    const remaining = tabs.filter((t) => t.id !== id);
    tabs = remaining;

    if (wasActive) {
      // Prefer the tab that took the closed tab's slot; otherwise the new last.
      const fallback = remaining[index] ?? remaining[remaining.length - 1]!;
      activeId = fallback.id;
    }
  }

  /**
   * Reorder the open tabs by moving the tab at fromIndex to toIndex. Does not
   * change which tab is active. Out-of-range indices are ignored.
   */
  function reorderTabs(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= tabs.length ||
      toIndex < 0 ||
      toIndex >= tabs.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    tabs = next;
  }

  /**
   * Swap new content into an existing tab through the shared clear-then-load
   * primitive: the tab's history is cleared, then the layout is loaded. Used
   * when a tab's content is replaced (file open into the current tab, restore).
   */
  function clearThenLoad(id: string, layout: Layout): void {
    const tab = getTab(id);
    if (!tab) return;
    // loadLayout clears history as part of the content swap (#2079).
    tab.store.loadLayout(layout);
  }

  return {
    get tabs() {
      return tabs;
    },
    get activeId() {
      return activeId;
    },
    get activeStore() {
      return activeStore;
    },
    openTab,
    switchTo,
    closeTab,
    reorderTabs,
    clearThenLoad,
  };
}

/** Public type of a workspace store instance. */
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

let workspaceInstance: WorkspaceStore | null = null;

/** Get the app-session workspace store (created lazily on first access). */
export function getWorkspaceStore(): WorkspaceStore {
  if (!workspaceInstance) {
    workspaceInstance = createWorkspaceStore();
  }
  return workspaceInstance;
}

/**
 * Reset the workspace to a single fresh tab (primarily for testing). Recreates
 * the instance and clears the app-session history singleton the first tab binds
 * to, so the new session starts with empty undo/redo.
 */
export function resetWorkspaceStore(): void {
  getHistoryStore().clear();
  workspaceInstance = createWorkspaceStore();
}
