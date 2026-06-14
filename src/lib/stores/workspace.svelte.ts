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
import { createLayout } from "$lib/utils/serialization";

/** A single open tab: a stable id plus the layout store backing it. */
export interface WorkspaceTab {
  /** Stable identity for the tab, independent of the layout's metadata id. */
  id: string;
  /** The layout store instance backing this tab (owns its own history). */
  store: LayoutStore;
  /**
   * The persisted layout id this tab restores from, when it came from the
   * browser-mode workspace index. Undefined for tabs created in-session.
   */
  layoutId?: string;
  /**
   * Whether the tab's real body has been loaded. A lazily-restored tab starts
   * false (a named placeholder shell) and flips true on first focus. Tabs
   * created in-session are hydrated from the start.
   */
  hydrated: boolean;
  /**
   * Set when a restore tab's persisted body could not be read on focus. The tab
   * stays in place (never silently vanishes); the interaction layer renders the
   * orphan/error state with Retry/Remove (#2018).
   */
  unreadable: boolean;
}

/** Result of reading a persisted layout body during lazy restore. */
export type RestoreBodyResult =
  | { ok: true; layout: Layout }
  | { ok: false };

/** Per-layout fields lazy restore reads from the index library. */
export interface RestoreLibraryEntry {
  name: string;
  changesSinceExport: number;
  hasEverExported: boolean;
}

/** The minimal index shape lazy restore needs (from spike #2179). */
export interface RestoreIndex {
  activeId: string | null;
  openTabs: string[];
  library: Record<string, RestoreLibraryEntry>;
}

/** Inputs for restoring a workspace from the persisted browser index. */
export interface RestoreWorkspaceArgs {
  index: RestoreIndex;
  /** Reads a persisted layout body by id (lazy, injected for testability). */
  loadBody: (id: string) => RestoreBodyResult;
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
    return {
      id: nextTabId(),
      store: createLayoutStore(getHistoryStore()),
      hydrated: true,
      unreadable: false,
    };
  }

  /** Collect device ids live in every tab except the one being hydrated. */
  function deviceIdsInOtherTabs(exceptTabId: string): Set<string> {
    // Transient local, built and consumed synchronously; never reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const ids = new Set<string>();
    for (const tab of tabs) {
      if (tab.id === exceptTabId || !tab.hydrated) continue;
      for (const rack of tab.store.racks) {
        for (const device of rack.devices) ids.add(device.id);
      }
    }
    return ids;
  }

  const firstTab = createInitialTab();
  let tabs = $state<WorkspaceTab[]>([firstTab]);
  let activeId = $state<string>(firstTab.id);

  // The body loader injected by restoreWorkspace, used for lazy hydration on
  // first focus of a restored shell tab. Null until a restore has run.
  let loadBodyFn: ((id: string) => RestoreBodyResult) | null = null;
  // Per-layout durability from the restored index, applied on hydration so the
  // chip and tab dots reflect true backup state (not reset to zero by the body
  // load). Keyed by persisted layout id.
  let restoreLibrary: Record<string, RestoreLibraryEntry> = {};

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
      hydrated: true,
      unreadable: false,
    };
    tabs = [...tabs, tab];
    activeId = tab.id;
    if (layout) {
      // loadLayout already clears this instance's history (clear-then-load).
      // Reserve ids live in other open tabs so an opened copy never aliases the
      // global image store's placement-<deviceId> keys (#2182).
      tab.store.loadLayout(layout, deviceIdsInOtherTabs(tab.id));
    }
    return tab.id;
  }

  /**
   * Hydrate a lazily-restored tab from its persisted body, once. Routes through
   * the same clear-then-load primitive as file open (empty history), and
   * regenerates device ids against the live cross-tab set so a restored copy of
   * an already-open layout cannot collide (#2182). An unreadable body leaves the
   * tab in place flagged `unreadable` for the #2018 orphan/error state.
   */
  function hydrateTab(tab: WorkspaceTab): void {
    if (tab.hydrated || !tab.layoutId || !loadBodyFn) return;
    const result = loadBodyFn(tab.layoutId);
    if (!result.ok) {
      tab.unreadable = true;
      tab.hydrated = true; // Resolved (to an error); do not retry on every focus.
      return;
    }
    tab.store.loadLayout(result.layout, deviceIdsInOtherTabs(tab.id));
    // loadLayout resets backup tracking. An autosaved restore is not explicitly
    // saved, so it is dirty; restore the persisted durability so the chip and tab
    // dot reflect true backup state. markDirty first (sets isDirty and bumps the
    // counter), then restoreBackupState overwrites the counter with the persisted
    // value, matching the single-session restore path.
    const entry = tab.layoutId ? restoreLibrary[tab.layoutId] : undefined;
    if (entry) {
      tab.store.markDirty();
      tab.store.restoreBackupState({
        changesSinceExport: entry.changesSinceExport,
        hasEverExported: entry.hasEverExported,
      });
    }
    tab.hydrated = true;
    tab.unreadable = false;
  }

  /**
   * Focus a tab. Pure focus change for the outgoing tab (no history mutation).
   * If the incoming tab is an unhydrated restore shell, its body is loaded lazily
   * on this first focus.
   */
  function switchTo(id: string): void {
    const tab = getTab(id);
    if (!tab) return;
    if (!tab.hydrated) hydrateTab(tab);
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
      // The new active tab may be an unhydrated restore shell; load its body
      // now so closing onto it shows the real layout, not the placeholder.
      if (!fallback.hydrated) hydrateTab(fallback);
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
    tab.store.loadLayout(layout, deviceIdsInOtherTabs(id));
  }

  /**
   * Restore the workspace from the persisted browser-mode index (#2080). Builds
   * one tab per open id in order, each carrying its persisted name as a shell.
   * The active tab is hydrated eagerly (its body loaded now); the rest stay
   * shells and hydrate lazily on first focus. Replaces the cold-start single
   * blank tab. No-op when there are no open tabs.
   */
  function restoreWorkspace(args: RestoreWorkspaceArgs): void {
    const { index, loadBody } = args;
    const openIds = index.openTabs.filter((id) => id in index.library);
    if (openIds.length === 0) return;

    loadBodyFn = loadBody;
    restoreLibrary = index.library;

    // A placeholder layout carries the persisted name so the tab shell renders
    // before its body is read. metadata.id holds the persisted id so a later
    // body load keeps the same identity.
    const restored: WorkspaceTab[] = openIds.map((layoutId) => {
      const name = index.library[layoutId]!.name;
      const placeholder: Layout = {
        ...createLayout(name),
        metadata: { id: layoutId, name },
      };
      const store = createLayoutStore(createHistoryStore());
      store.loadLayout(placeholder);
      return { id: nextTabId(), store, layoutId, hydrated: false, unreadable: false };
    });

    tabs = restored;
    const activeLayoutId =
      index.activeId && openIds.includes(index.activeId)
        ? index.activeId
        : openIds[0]!;
    const activeTabEntry = restored.find((t) => t.layoutId === activeLayoutId)!;
    activeId = activeTabEntry.id;

    // Eager hydration of the active tab only: its body loads now, the others on
    // focus. Done after the active id is set so cross-tab reservation sees the
    // (still-shell) siblings excluded.
    hydrateTab(activeTabEntry);
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
    restoreWorkspace,
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
