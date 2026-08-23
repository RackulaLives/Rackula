import {
  isApiAvailable,
  setApiAvailable,
  getApiAvailableState,
  getStorageMode,
} from "./availability.svelte";
import {
  saveLayoutToServer,
  checkApiHealth,
  PersistenceError,
  getServerInstanceLabel,
  listSavedLayouts,
  loadSavedLayout,
} from "./api";
import { saveSession, clearSession } from "./working-copy";
import { getServerBaseUpdatedAt, setServerBaseUpdatedAt } from "./server-base";
import { upsertServerLibraryItem } from "./server-library.svelte";
import { loadFromFile } from "./load-pipeline";
import { runOpenFileFlow } from "$lib/actions/open-file-trigger";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import {
  downloadYamlFile,
  createMultiLayoutArchive,
  generateExportAllFilename,
  type LayoutArchiveEntry,
} from "$lib/utils/archive";
import { generateId } from "$lib/utils/device";
import type { Layout, LayoutMetadata } from "$lib/types";
import { persistenceDebug } from "$lib/utils/debug";

export type SaveStatus =
  "idle" | "saving" | "saved" | "error" | "offline" | "disabled";
let _saveStatus = $state<SaveStatus>("idle");

// Circuit breaker
const MAX_SAVE_FAILURES = 3;
let _consecutiveSaveFailures = $state(0);

// Active error toast ID for dedup (dismiss before showing new one)
let _errorToastId: string | undefined = undefined;

// Timer variables (plain let, not $state — not reactive)
let serverSaveTimer: ReturnType<typeof setTimeout> | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Bumped only by an auto-save effect run that actually schedules a save (i.e.
// one that reaches past all of the effect's early-return guards). A debounced
// save captures the id at schedule time; if a newer run that also schedules a
// save bumps it while the first save is in flight, the live layout has edits
// that first save did not persist, so its success must not clear the
// dirty/session state for those newer edits. A run that early-returns (e.g. a
// transient availability flip with no new edit) must NOT bump the id, or it
// falsely invalidates an in-flight save that never lost any edits (#2936).
let _serverSaveScheduleId = 0;

// Bumped by abandonWorkingCopy(). A save captures the generation when it is
// scheduled; if the generation has moved on by the time the PUT settles, that
// save belongs to a working copy the user has since dropped, so its success
// must write nothing back locally (#3151). The schedule id cannot express this
// on its own: it only suppresses the dirty/clean reset, while the base and
// session writes are deliberately independent of it (#2926).
let _abandonGeneration = 0;

// Server saves whose request is outstanding right now. Both save paths
// register theirs here for as long as it is in flight, so a delete can drain
// them before issuing its DELETE (#3151). A list rather than a single promise:
// a manual save can start while a debounced one is still settling, and
// draining only the newer of the two would leave the older PUT free to land
// after the DELETE and re-create the layout on the server. Entries never
// reject; see trackInFlightSave. Plain, like the timer variables above:
// nothing reads this in a reactive context, so it is not $state.
let inFlightServerSaves: Promise<void>[] = [];

// Upper bound on how long a delete waits for an in-flight save. Each request
// saveLayoutToServer makes is already bounded (AbortSignal.timeout), but one
// save can make several of them (the YAML PUT, then one per reconciled asset),
// so the total is only bounded in principle. This caps the barrier so a slow
// save degrades to the old behaviour rather than hanging the delete.
const SAVE_BARRIER_TIMEOUT_MS = 15000;

/**
 * Register an outstanding server save so {@link awaitInFlightSave} can drain
 * it, returning the caller's own promise unchanged so its result and its
 * rejection still belong to the caller.
 */
function trackInFlightSave<T>(save: Promise<T>): Promise<T> {
  // The tracked copy settles on both outcomes: the barrier only needs the
  // request to be finished, and a rejecting entry would surface as an
  // unhandled rejection with no one left to catch it.
  const settled = save.then(
    () => undefined,
    () => undefined,
  );
  inFlightServerSaves.push(settled);
  void settled.then(() => {
    inFlightServerSaves = inFlightServerSaves.filter((s) => s !== settled);
  });
  return save;
}

/**
 * Resolve once no server save is on the wire (#3151).
 *
 * The save barrier a delete awaits between suspending autosave and issuing its
 * DELETE. {@link suspendServerAutosave} stops a save that has not started yet,
 * but a PUT already awaiting its response cannot be recalled: if it lands after
 * the DELETE, the server re-creates the layout the user just deleted, and the
 * client has already reported a clean deletion. Suspend first and drain second,
 * or a fresh save can be scheduled while the barrier waits.
 *
 * Resolves immediately when nothing is in flight, and never rejects: a save
 * that fails is not the barrier's problem, since a failed PUT cannot re-create
 * anything. The wait is capped at {@link SAVE_BARRIER_TIMEOUT_MS} so an
 * unusually slow save cannot hang the delete indefinitely.
 */
export function awaitInFlightSave(): Promise<void> {
  if (inFlightServerSaves.length === 0) return Promise.resolve();
  const drained = Promise.all(inFlightServerSaves);
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SAVE_BARRIER_TIMEOUT_MS);
    void drained.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// After a durable save the pending session debounce must be cancelled, or it
// resurrects the cleared session copy and triggers a false unload warning
function cancelSessionSave(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    _sessionSavePending = false;
  }
}

// Reactive mirrors of the timers, for the beforeunload risk condition
let _sessionSavePending = $state(false);
let _serverSavePending = $state(false);

export function isSessionSavePending(): boolean {
  return _sessionSavePending;
}

export function isServerSavePending(): boolean {
  return _serverSavePending || _saveStatus === "saving";
}

export function getConsecutiveSaveFailures(): number {
  return _consecutiveSaveFailures;
}

/**
 * Chip data source: save state plus backup state behind one read surface.
 * Property reads are reactive; call inside a reactive context to track them.
 */
export function getStorageChipState() {
  const layoutStore = getLayoutStore();
  return {
    get saveStatus(): SaveStatus {
      return _saveStatus;
    },
    get consecutiveSaveFailures(): number {
      return _consecutiveSaveFailures;
    },
    get changesSinceExport(): number {
      return layoutStore.changesSinceExport;
    },
    get hasEverExported(): boolean {
      return layoutStore.hasEverExported;
    },
  };
}

/**
 * What a completed server save knows about itself (#3151).
 *
 * Both save paths build this when the save is scheduled and thread it through
 * to {@link finalizeSuccessfulSave}, so finalization never has to read global
 * state that may have moved on while the PUT was in flight.
 */
export interface CompletedSaveContext {
  /**
   * The snapshot this save actually sent, which doubles as the identity of the
   * working copy it belongs to (metadata.id). The catalogue row is built from
   * it, never from the live layout, and the id is what finalization compares
   * against the live layout: loadFromApi replaces the working copy without
   * bumping the schedule id, so the live layout at finalize time can be a
   * different layout entirely. Every store ingress guarantees a metadata.id
   * (loadLayout mints one when the data has none), and saveLayoutToServer
   * refuses a layout without one, so a save that reaches finalization always
   * has an id to compare.
   */
  layout: Layout;
  /**
   * The abandon generation captured when this save was scheduled. Omitted only
   * by callers with no scheduling phase (tests calling finalize directly); an
   * omitted value counts as "not abandoned".
   */
  abandonGeneration?: number;
}

/**
 * Shared success epilogue for a durable server save, called by both the manual
 * (handleSaveToServer) and debounced auto-save paths so a successful auto-save
 * leaves the layout in the same state as a manual one.
 *
 * Always (server is healthy): resets the consecutive-failure counter, marks the
 * API available, and dismisses any lingering error toast.
 *
 * What is written back locally depends on which working copy is live when the
 * save settles, because the server base and the session slot are both single,
 * global slots that belong to whichever copy is open now:
 *
 * - Still the same layout, save finalized "stale" (clearDirtyState false,
 *   newer edits arrived while the PUT was in flight): the base still advances
 *   and the session is re-stamped with it, independent of clearDirtyState. The
 *   echo is this tab's own write against the layout that is still open, so the
 *   base must advance immediately, or a reconcile before the follow-up save
 *   fires sees false divergence against it and can discard newer local edits
 *   (#2926). Only the dirty flag and the session debounce are preserved for
 *   that follow-up save.
 * - The working copy was replaced (loadFromApi opened a different layout, or a
 *   reset swapped one in): dirty state, the base, and the session are all left
 *   alone. Loading does not bump the schedule id, so such a save can still be
 *   "current" by schedule id, but its echo describes a layout that is no longer
 *   open. Applying it would mark the new copy clean, hand its next save the
 *   wrong optimistic-concurrency timestamp, and write its session under a base
 *   that was never its own (#3151). The catalogue upsert is deliberately
 *   outside this guard: the PUT did reach the server, so the row for the layout
 *   it wrote is correct and is still recorded.
 * - The working copy was abandoned (deleted while the PUT was in flight):
 *   nothing at all is written back, the catalogue row included, since
 *   re-stamping the base or the session would resurrect state the user just
 *   deleted. See {@link abandonWorkingCopy}.
 *
 * When clearDirtyState is true (the default) and the working copy is still the
 * one that was saved: also sets status to "saved", marks the layout clean, and
 * cancels the pending session debounce.
 *
 * @param clearDirtyState Pass false for a stale debounced save whose captured
 *   snapshot is older than the live layout (newer unsaved edits arrived while the
 *   save was in flight). The dirty flag and session state are then preserved for
 *   the follow-up save so unload warnings and recovery data survive.
 * @param newUpdatedAt The server-echoed updatedAt from this save's PUT response.
 *   Becomes the base threaded into subsequent PUTs and stamped onto the copy.
 * @param completed Identity of the save being finalized: the snapshot it sent
 *   and the abandon generation it captured. Required for the catalogue upsert,
 *   which has nothing to record without the saved snapshot, and for the
 *   replaced-working-copy and abandoned checks, which have no identity to
 *   compare without it. Omitted by callers with no scheduling phase (tests
 *   calling finalize directly); both checks then treat the save as current.
 */
export function finalizeSuccessfulSave(
  clearDirtyState = true,
  newUpdatedAt: string | null = null,
  completed: CompletedSaveContext | null = null,
): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  _consecutiveSaveFailures = 0;
  setApiAvailable(true);
  if (_errorToastId) {
    toastStore.dismissToast(_errorToastId);
    _errorToastId = undefined;
  }
  // Server health above is a fact regardless of what happened locally, so it
  // is recorded first. Everything below writes state back for a working copy
  // that no longer exists once this save has been abandoned, so an abandoned
  // save stops here (#3151).
  if (
    completed?.abandonGeneration !== undefined &&
    completed.abandonGeneration !== _abandonGeneration
  ) {
    return;
  }
  // Keep the server catalogue current without a refetch (#3151). Autosave
  // fires every 2 seconds while editing, so invalidating on save would mean
  // one GET /api/layouts per save. A null newUpdatedAt means the server
  // returned no new timestamp, so there is nothing to record. Also gated on
  // clearDirtyState: a stale save's live layout has already moved on, so its
  // name and counts are the wrong thing to record, and the follow-up save that
  // made it stale will upsert correctly. Recorded before the working-copy
  // check below and from the snapshot this save sent, not from the live
  // layout: a save that finalizes against a copy that replaced its own still
  // wrote the layout it captured, so that row is correct and belongs in the
  // catalogue even though nothing may be written back locally.
  const savedLayoutId = completed?.layout.metadata?.id;
  if (clearDirtyState && newUpdatedAt && completed) {
    const saved = completed.layout;
    if (savedLayoutId) {
      const racks = saved.racks ?? [];
      upsertServerLibraryItem({
        id: savedLayoutId,
        name: saved.name,
        version: saved.version,
        updatedAt: newUpdatedAt,
        rackCount: racks.length,
        deviceCount: racks.reduce((sum, rack) => sum + rack.devices.length, 0),
        valid: true,
      });
    }
  }
  // Everything below writes into state that belongs to whichever working copy
  // is open now: the dirty flag, the single global server base, and the single
  // session slot. A save whose layout is no longer the open one must write
  // none of it (#3151). This is not the stale case, which is about newer edits
  // to the SAME layout and must still advance the base (#2926): loading a
  // different layout leaves the schedule id untouched, so the swap is only
  // visible by comparing identities. A save with no identity to compare (no
  // completed context, or a snapshot with no metadata.id) counts as current,
  // matching the abandon check above.
  if (savedLayoutId && savedLayoutId !== layoutStore.layout.metadata?.id) {
    return;
  }
  if (clearDirtyState) {
    _saveStatus = "saved";
    layoutStore.markClean();
    cancelSessionSave();
  }
  if (newUpdatedAt) {
    setServerBaseUpdatedAt(newUpdatedAt);
  }
  if (clearDirtyState || newUpdatedAt) {
    saveSession(
      layoutStore.layout,
      {
        changesSinceExport: layoutStore.changesSinceExport,
        hasEverExported: layoutStore.hasEverExported,
      },
      getServerBaseUpdatedAt(),
    );
  }
}

function handleSaveFailure(
  notify: boolean,
  action?: { label: string; onClick: () => void },
): void {
  const toastStore = getToastStore();
  _consecutiveSaveFailures++;
  setApiAvailable(false);
  _saveStatus = "offline";
  if (_consecutiveSaveFailures >= MAX_SAVE_FAILURES) {
    persistenceDebug.api(
      "circuit breaker open after %d consecutive failures — auto-save paused",
      _consecutiveSaveFailures,
    );
    if (_errorToastId) {
      toastStore.dismissToast(_errorToastId);
    }
    _errorToastId = toastStore.showToast(
      "Server unavailable. Working offline; changes saved locally. Reload to retry.",
      "warning",
      0,
      action,
    );
  } else if (notify) {
    if (_errorToastId) {
      toastStore.dismissToast(_errorToastId);
    }
    _errorToastId = toastStore.showToast(
      "Save failed — backend unavailable",
      "error",
      0,
      action,
    );
  }
}

export function handlePersistenceError(
  e: unknown,
  notify = false,
  onRetry?: () => void,
): void {
  const toastStore = getToastStore();
  const action = onRetry ? { label: "Retry", onClick: onRetry } : undefined;
  if (e instanceof PersistenceError) {
    // Auth expiry (401): the server is reachable but the Access session lapsed.
    // This is distinct from server-down: do not trip the offline circuit breaker
    // and do not flip to offline. Surface a re-authenticate affordance instead of
    // the retry/backup "working offline" treatment.
    if (e.statusCode === 401) {
      _saveStatus = "error";
      if (_errorToastId) {
        toastStore.dismissToast(_errorToastId);
      }
      _errorToastId = toastStore.showToast(
        "Your session expired. Reload to re-authenticate; your changes are saved locally.",
        "warning",
        0,
        {
          label: "Reload",
          onClick: () => {
            if (typeof window !== "undefined") window.location.reload();
          },
        },
      );
      return;
    }
    // Storage quota rejections (507 asset limit, 429 layout limit). The server is
    // reachable and the data is intact, so this is a recoverable error state, not
    // offline: do not flip to offline or trip the circuit breaker, and 507 must
    // not fall through to the >= 500 branch. 429 is also used by the API rate
    // limiter ("Too Many Requests"), so the layout-quota case is distinguished by
    // the server error text; 507 is only ever the asset quota.
    const isStorageQuota =
      e.statusCode === 507 ||
      (e.statusCode === 429 && /quota/i.test(e.message));
    if (isStorageQuota) {
      _saveStatus = "error";
      if (notify) {
        const message =
          e.statusCode === 507
            ? "Storage full: asset limit reached for this layout. Remove existing assets to add new ones."
            : "Storage full: layout limit reached. Delete existing layouts to save new ones.";
        if (_errorToastId) {
          toastStore.dismissToast(_errorToastId);
        }
        _errorToastId = toastStore.showToast(message, "error", 0, action);
      }
    } else if (
      e.statusCode === undefined ||
      e.statusCode === 404 ||
      (typeof e.statusCode === "number" && e.statusCode >= 500)
    ) {
      handleSaveFailure(notify, action);
    } else {
      _saveStatus = "error";
      if (notify) {
        if (_errorToastId) {
          toastStore.dismissToast(_errorToastId);
        }
        _errorToastId = toastStore.showToast("Save failed", "error", 0, action);
      }
    }
  } else {
    handleSaveFailure(notify, action);
  }
}

/** Returns true when the save succeeded, false when it failed. */
export async function handleSaveToServer(isManual = false): Promise<boolean> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  try {
    const scheduleId = ++_serverSaveScheduleId;
    const abandonGeneration = _abandonGeneration;
    _saveStatus = "saving";
    if (serverSaveTimer) {
      clearTimeout(serverSaveTimer);
      serverSaveTimer = null;
      _serverSavePending = false;
    }
    const snapshot = structuredClone($state.snapshot(layoutStore.layout));
    const imagesSnapshot = getImageStore().getUserImages();
    const result = await trackInFlightSave(
      saveLayoutToServer(snapshot, imagesSnapshot, getServerBaseUpdatedAt()),
    );
    finalizeSuccessfulSave(
      scheduleId === _serverSaveScheduleId,
      result.updatedAt,
      { layout: snapshot, abandonGeneration },
    );
    if (isManual) {
      toastStore.showToast("Layout saved", "success", 3000);
    }
    return true;
  } catch (e) {
    persistenceDebug.api("Manual save failed: %O", e);
    handlePersistenceError(e, true, () => handleSaveToServer(isManual));
    return false;
  }
}

/** Returns true when the save succeeded, false when cancelled or failed. */
export async function handleSaveAsArchive(): Promise<boolean> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  try {
    const { filename, oversized } = await downloadYamlFile(
      layoutStore.layout,
      getImageStore().getUserImages(),
    );
    layoutStore.markClean();
    layoutStore.markExported();
    cancelSessionSave();
    clearSession();
    toastStore.showToast(`Saved ${filename}`, "success", 3000);
    if (oversized > 0) {
      toastStore.showToast(
        `${oversized} image${oversized > 1 ? "s" : ""} exceed 100KB; consider optimising them to keep files small.`,
        "warning",
        6000,
      );
    }
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }
    persistenceDebug.api("Failed to save layout: %O", error);
    toastStore.showToast("Failed to save layout. Please try again.", "error");
    return false;
  }
}

/**
 * Coerce a layout's partial metadata into a complete LayoutMetadata, minting a
 * UUID when the layout has never been persisted. Keeps the export-all folder
 * name stable for an existing layout and valid for a brand-new one.
 */
function resolveLayoutMetadata(layout: {
  name: string;
  metadata?: Partial<LayoutMetadata>;
}): LayoutMetadata {
  return {
    id: layout.metadata?.id ?? generateId(),
    name: layout.metadata?.name ?? layout.name,
    schema_version: layout.metadata?.schema_version ?? "1.0",
    description: layout.metadata?.description,
  };
}

/**
 * Export every layout as one ZIP, framed per storage mode (#2045).
 *
 * Browser mode is a backup: it bundles the open layout's folder-archive form
 * and, on success, resets changesSinceExport so the chip goes green. Server
 * mode is a portable copy: it flushes the active layout to the server so the
 * artifact is not missing the debounce window, pulls authoritative YAML from
 * GET /layouts for every stored layout, and never touches chip state.
 *
 * Until the tabs work lands, "all layouts" degrades to the single open layout
 * in browser mode and to the full server list in server mode.
 *
 * @returns true when an archive was saved, false when cancelled or failed.
 */
export async function handleExportAll(): Promise<boolean> {
  return getStorageMode() === "server" ? exportAllServer() : exportAllBrowser();
}

/** Browser-mode export-all: back up the open layout and reset the chip. */
async function exportAllBrowser(): Promise<boolean> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  try {
    const snapshot = structuredClone($state.snapshot(layoutStore.layout));
    const entry: LayoutArchiveEntry = {
      layout: snapshot,
      images: getImageStore().getUserImages(),
      metadata: resolveLayoutMetadata(snapshot),
    };
    const blob = await createMultiLayoutArchive([entry]);
    const saved = await saveArchiveBlob(blob);
    if (!saved) return false;
    // Backup framing: a successful run is the chip's green boundary.
    layoutStore.markClean();
    layoutStore.markExported();
    cancelSessionSave();
    clearSession();
    toastStore.showToast("Backed up all layouts", "success", 3000);
    return true;
  } catch (error) {
    return reportExportAllFailure(error);
  }
}

/** Server-mode export-all: portable copy from authoritative server YAML. */
async function exportAllServer(): Promise<boolean> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  try {
    // Flush the active layout so the server copy includes edits still inside
    // the 2s auto-save debounce window before we read the authoritative list.
    // If the flush fails the server is mid-edit-stale, so warn rather than ship
    // a "complete" copy silently missing the unsaved window (#2045 AC).
    let flushedStale = false;
    if (isApiAvailable() && layoutStore.isDirty && layoutStore.hasRack) {
      flushedStale = !(await handleSaveToServer());
    }
    if (flushedStale) {
      toastStore.showToast(
        "Couldn't save your latest edits; the copy reflects the last saved server state.",
        "warning",
        6000,
      );
    }
    // listSavedLayouts() returns [] both when the server is unreachable and
    // when the library is genuinely empty, so guard availability first to keep
    // an outage from masquerading as an empty library.
    if (!isApiAvailable()) {
      toastStore.showToast(
        `Can't reach ${getServerInstanceLabel()} to export. Reload to retry.`,
        "warning",
        6000,
      );
      return false;
    }
    const items = await listSavedLayouts();
    const valid = items.filter((item) => item.valid);
    if (valid.length === 0) {
      toastStore.showToast("No layouts to export", "warning", 4000);
      return false;
    }
    // Load layouts concurrently: each is an independent GET, so serializing
    // them makes export time grow linearly with the library size.
    const entries: LayoutArchiveEntry[] = await Promise.all(
      valid.map(async (item) => {
        const { layout, images } = await loadSavedLayout(item.id);
        return {
          layout,
          images,
          metadata: resolveLayoutMetadata({
            ...layout,
            metadata: { ...layout.metadata, id: item.id, name: item.name },
          }),
        } satisfies LayoutArchiveEntry;
      }),
    );
    const blob = await createMultiLayoutArchive(entries);
    const saved = await saveArchiveBlob(blob);
    if (!saved) return false;
    // Portable-copy framing: never the backup boundary, so chip state is left
    // untouched.
    toastStore.showToast(
      `Exported a copy of ${entries.length} layout${entries.length > 1 ? "s" : ""}`,
      "success",
      3000,
    );
    return true;
  } catch (error) {
    return reportExportAllFailure(error);
  }
}

/**
 * Save an export-all blob via the native save dialog.
 * @returns false when the user cancels, true when written.
 */
async function saveArchiveBlob(blob: Blob): Promise<boolean> {
  const { fileSave } = await import("browser-fs-access");
  try {
    await fileSave(blob, {
      fileName: generateExportAllFilename(),
      extensions: [".zip"],
      description: "Rackula Layouts Export",
    });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }
    throw error;
  }
}

/** Shared failure epilogue for export-all: log and surface one error toast. */
function reportExportAllFailure(error: unknown): boolean {
  persistenceDebug.api("Export-all failed: %O", error);
  getToastStore().showToast(
    error instanceof Error ? error.message : "Failed to export layouts",
    "error",
  );
  return false;
}

export function shouldSaveToServer(): boolean {
  return getStorageMode() === "server" && isApiAvailable();
}

export async function handleLoad(): Promise<void> {
  if (getStorageMode() === "server") {
    dialogStore.open("load");
  } else {
    // Opening a file replaces the working copy. runOpenFileFlow checks
    // changesSinceExport itself and only prompts when there are changes not
    // yet in any exported file; a fully backed-up copy goes straight to the
    // file picker (#2987, mirrors restore-file). The same guard is shared by
    // LoadDialog's "Import from local file" and saved-layout sub-flows.
    runOpenFileFlow((guarded) =>
      loadFromFile(
        undefined,
        guarded ? { successMessage: "Previous layout kept in Layouts" } : {},
      ),
    );
  }
}

export function flushSessionSave(): void {
  const layoutStore = getLayoutStore();
  if (saveDebounceTimer && layoutStore.hasRack) {
    cancelSessionSave();
    saveSession(
      layoutStore.layout,
      {
        changesSinceExport: layoutStore.changesSinceExport,
        hasEverExported: layoutStore.hasEverExported,
      },
      getServerBaseUpdatedAt(),
    );
  }
}

/**
 * Stop server autosave for the active working copy, without dropping it
 * (#3151).
 *
 * Cancels the pending debounce, marks any settling save stale, and clears the
 * "saving" status. Nothing durable is touched: the session copy and the server
 * base survive, so the next edit re-arms autosave against the same base as
 * before.
 *
 * This is the half of {@link abandonWorkingCopy} that is safe to run before a
 * DELETE. Deleting the open layout must stop autosave first, or the debounce
 * PUTs the layout straight back once the DELETE lands, but it must not destroy
 * local state until the layout is actually gone: a DELETE that fails leaves the
 * layout on the server, and the working copy is still its local copy.
 *
 * Stopping autosave only prevents a save that has not started. A save already
 * in flight is drained separately, by {@link awaitInFlightSave}, which the
 * delete flow awaits after this and before its DELETE.
 */
export function suspendServerAutosave(): void {
  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
    serverSaveTimer = null;
  }
  _serverSavePending = false;
  _serverSaveScheduleId++;
  _saveStatus = "idle";
}

/**
 * Drop the working copy without saving it (#3151).
 *
 * Deleting the layout that is currently open must not leave a live working
 * copy behind: the debounced autosave would PUT it straight back after the
 * DELETE, and the next reload would reconcile the surviving session as
 * unknown-to-server and restore the layout the user just deleted. Callers run
 * {@link suspendServerAutosave} before the DELETE and this only once the
 * layout is actually gone.
 *
 * Two guards, because they suppress different things. Bumping the schedule id
 * (via suspendServerAutosave) marks any settling save stale, which suppresses
 * clearing dirty state and re-recording the server-catalogue row. That alone
 * is not enough: recording the base and re-stamping the working copy run
 * whenever the PUT echoes an updatedAt, independent of clearDirtyState
 * (#2926), so a settling save would write a fresh session copy of the layout
 * that was just abandoned, and the next reload would reconcile it as
 * unknown-to-server. Bumping the abandon generation is what stops that: a save
 * that captured an older generation writes nothing back at all.
 *
 * A PUT already on the wire is a separate problem, and a server-side one: it
 * still reaches the server, and if it lands after the DELETE the server
 * re-creates the row. That is closed by {@link awaitInFlightSave}, which the
 * delete flow drains before issuing its DELETE, not by anything here.
 */
export function abandonWorkingCopy(): void {
  suspendServerAutosave();
  _abandonGeneration++;
  cancelSessionSave();
  clearSession();
  setServerBaseUpdatedAt(null);
}

export function initPersistenceEffects(): void {
  const layoutStore = getLayoutStore();

  // Effect 1: Auto-save layout to the legacy single-slot working copy
  // (Rackula:autosave) with debouncing. This is the server-mode offline
  // continuity copy. In browser mode the multi-layout workspace schema (#2179,
  // wired in PersistenceEffects) owns persistence, and the legacy slot is
  // consumed once by adoption (#2080), so this effect is server-mode only.
  // Guard: skip clearing on initial run to avoid wiping saved session
  // before App.onMount can restore it (race condition fix)
  let hasEverHadRack = false;
  $effect(() => {
    if (getStorageMode() === "browser") return;
    const currentLayout = layoutStore.layout;
    if (layoutStore.hasRack) {
      hasEverHadRack = true;
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
      }
      _sessionSavePending = true;
      saveDebounceTimer = setTimeout(() => {
        saveSession(
          currentLayout,
          {
            changesSinceExport: layoutStore.changesSinceExport,
            hasEverExported: layoutStore.hasEverExported,
          },
          getServerBaseUpdatedAt(),
        );
        saveDebounceTimer = null;
        _sessionSavePending = false;
      }, 1000);
    } else {
      cancelSessionSave();
      // Only clear session if we previously had a rack — prevents wiping
      // localStorage before App.onMount restores the session on page load
      if (hasEverHadRack) {
        clearSession();
      }
    }
    return cancelSessionSave;
  });

  // Effect 2: Auto-save to server when API is available
  $effect(() => {
    // Server mode only, matching Effects 1 and 3. isApiAvailable() is the
    // server-mode reachability signal; this explicit mode guard keeps a future
    // browser-mode caller that sets apiAvailable (e.g. a misconfiguration probe)
    // from ever waking server autosave in browser mode (#2063).
    if (getStorageMode() !== "server") return;
    if (!isApiAvailable()) return;
    if (_consecutiveSaveFailures >= MAX_SAVE_FAILURES) return;
    const layout = layoutStore.layout;
    if (!layout.name) return;
    if (!layoutStore.hasStarted) return;
    if (layout.racks.length === 0) return;
    if (serverSaveTimer) {
      clearTimeout(serverSaveTimer);
    }
    // Capture this run's schedule id only once the run has committed to
    // scheduling a save. A run that early-returns above never schedules a
    // replacement, so it must not bump the id and falsely invalidate an
    // in-flight save (#2936). A later run that also reaches here (e.g. an
    // edit during the in-flight save) bumps it and marks that earlier save's
    // success stale, since the live layout now has edits it did not persist.
    const scheduleId = ++_serverSaveScheduleId;
    const abandonGeneration = _abandonGeneration;
    const snapshot = structuredClone($state.snapshot(layout));
    const imagesSnapshot = getImageStore().getUserImages();
    _serverSavePending = true;
    serverSaveTimer = setTimeout(async () => {
      // Clear pending state before the await: a stale continuation must not
      // clobber a newer scheduled save. The synchronous "saving" status keeps
      // isServerSavePending() true for the in-flight phase.
      serverSaveTimer = null;
      _serverSavePending = false;
      _saveStatus = "saving";
      try {
        const result = await trackInFlightSave(
          saveLayoutToServer(
            snapshot,
            imagesSnapshot,
            getServerBaseUpdatedAt(),
          ),
        );
        // Only clear dirty/session state if no newer save was scheduled while
        // this one was in flight; otherwise newer unsaved edits exist.
        finalizeSuccessfulSave(
          scheduleId === _serverSaveScheduleId,
          result.updatedAt,
          { layout: snapshot, abandonGeneration },
        );
      } catch (e) {
        persistenceDebug.api("Auto-save failed: %O", e);
        handlePersistenceError(e);
      }
    }, 2000);
    return () => {
      if (serverSaveTimer) {
        clearTimeout(serverSaveTimer);
        serverSaveTimer = null;
        _serverSavePending = false;
      }
    };
  });

  // Effect 3: Periodically check API health when offline
  $effect(() => {
    const apiState = getApiAvailableState();
    if (apiState === null) return;
    if (apiState === true) return;
    if (getStorageMode() !== "server") return;
    if (_saveStatus === "disabled") return;
    if (_consecutiveSaveFailures >= MAX_SAVE_FAILURES) return;

    persistenceDebug.health("API offline, starting health check interval");
    const intervalId = setInterval(async () => {
      const healthy = await checkApiHealth();
      if (healthy) {
        persistenceDebug.health("API health check passed, marking available");
        setApiAvailable(true);
        _saveStatus = "idle";
        const toastStore = getToastStore();
        if (_errorToastId) {
          toastStore.dismissToast(_errorToastId);
          _errorToastId = undefined;
        }
        // Quiet recovery notice on resync (auto-dismisses).
        toastStore.showToast(
          `Reconnected to ${getServerInstanceLabel()}.`,
          "success",
          3000,
        );
      } else {
        persistenceDebug.health("API health check failed, still offline");
      }
    }, 30000);

    return () => clearInterval(intervalId);
  });
}

export function resetPersistenceManager(): void {
  _saveStatus = "idle";
  _consecutiveSaveFailures = 0;
  if (_errorToastId) {
    getToastStore().dismissToast(_errorToastId);
  }
  _errorToastId = undefined;
  if (serverSaveTimer) {
    clearTimeout(serverSaveTimer);
    serverSaveTimer = null;
  }
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  _serverSavePending = false;
  _sessionSavePending = false;
  // Both counters are monotonic, and production always captures the live value
  // rather than assuming a starting point. A test that hardcodes an expected
  // generation would otherwise silently take the abandoned-save early return
  // in finalizeSuccessfulSave and read as a passing no-op, so reset them with
  // the rest of the module state. The in-flight set goes too: a save left
  // outstanding by one test must not make the next test's delete barrier wait
  // on it (#3151).
  _serverSaveScheduleId = 0;
  _abandonGeneration = 0;
  inFlightServerSaves = [];
}
