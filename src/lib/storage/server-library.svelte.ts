/**
 * Server-mode layout catalogue (#3151).
 *
 * The Layouts panel lists saved layouts from `workspaceStore.library` in
 * browser mode, which is fed by the localStorage workspace index. Server mode
 * has no such index: its catalogue is whatever `GET /api/layouts` returns. This
 * store holds that list reactively so the panel and the mobile sheet can render
 * it, and so a local save or delete can update it in place.
 *
 * Import direction: `manager` imports this module, never the reverse. Errors
 * are caught here rather than routed through `handlePersistenceError`, which
 * would create a cycle back into the manager.
 */
import { listSavedLayouts, type SavedLayoutItem } from "./api";
import { initializePersistence, isApiAvailable } from "./availability.svelte";
import { persistenceDebug } from "$lib/utils/debug";

const log = persistenceDebug.api;

export type ServerLibraryStatus = "idle" | "loading" | "ready" | "unavailable";

let items = $state<SavedLayoutItem[]>([]);
let status = $state<ServerLibraryStatus>("idle");

// Request-sequence guard. A refresh that replaces the list wholesale must not
// drop rows an upsert recorded while its GET was in flight, so every mutation
// during a fetch is remembered and re-applied when the fetch lands.
let fetchSequence = 0;
let pendingUpserts: SavedLayoutItem[] = [];
let pendingRemovals: string[] = [];
let fetchInFlight = false;

function applyUpsert(list: SavedLayoutItem[], item: SavedLayoutItem) {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    list.push(item);
    return;
  }
  list[index] = item;
}

/** The reactive catalogue. Read inside a `$derived` to track it. */
export function getServerLibrary(): {
  items: readonly SavedLayoutItem[];
  status: ServerLibraryStatus;
} {
  return {
    get items() {
      return items;
    },
    get status() {
      return status;
    },
  };
}

/**
 * Fetch the server's layout list.
 *
 * Awaits `initializePersistence()` (cached and de-duplicated) before reading
 * availability: the panel can mount before the first health check resolves,
 * and reading `apiAvailable` while it is still null would report a healthy
 * server as unavailable.
 */
export async function refreshServerLibrary(): Promise<void> {
  const sequence = ++fetchSequence;
  status = "loading";
  fetchInFlight = true;
  // Deliberately not resetting pendingUpserts/pendingRemovals here: an
  // overlapping refresh (this call starting before an earlier one's GET has
  // resolved) must not wipe mutations that earlier fetch's window already
  // queued. The sequence-guarded `finally` below clears them once the
  // winning fetch actually lands, which also covers the normal
  // non-overlapping case.

  try {
    await initializePersistence();
    if (!isApiAvailable()) {
      if (sequence === fetchSequence) status = "unavailable";
      return;
    }
    const fetched = await listSavedLayouts();
    if (sequence !== fetchSequence) return;

    const merged = [...fetched];
    for (const item of pendingUpserts) applyUpsert(merged, item);
    items = merged.filter((item) => !pendingRemovals.includes(item.id));
    status = "ready";
  } catch (error) {
    log("refreshServerLibrary: failed %O", error);
    if (sequence === fetchSequence) status = "unavailable";
  } finally {
    if (sequence === fetchSequence) {
      fetchInFlight = false;
      pendingUpserts = [];
      pendingRemovals = [];
    }
  }
}

/** Record a layout this client just saved, without a refetch. */
export function upsertServerLibraryItem(item: SavedLayoutItem): void {
  if (fetchInFlight) pendingUpserts.push(item);
  const next = [...items];
  applyUpsert(next, item);
  items = next;
}

/** Drop a layout this client just deleted. */
export function removeServerLibraryItem(id: string): void {
  if (fetchInFlight) pendingRemovals.push(id);
  items = items.filter((item) => item.id !== id);
}

/** Test seam: clear all state. */
export function resetServerLibrary(): void {
  items = [];
  status = "idle";
  fetchSequence = 0;
  fetchInFlight = false;
  pendingUpserts = [];
  pendingRemovals = [];
}
