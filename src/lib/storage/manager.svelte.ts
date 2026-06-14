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
import {
  getServerBaseUpdatedAt,
  setServerBaseUpdatedAt,
} from "./server-base";
import { loadFromFile } from "./load-pipeline";
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
import type { LayoutMetadata } from "$lib/types";
import { persistenceDebug } from "$lib/utils/debug";

export type SaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "offline"
  | "disabled";
let _saveStatus = $state<SaveStatus>("idle");

// Circuit breaker
const MAX_SAVE_FAILURES = 3;
let _consecutiveSaveFailures = $state(0);

// Active error toast ID for dedup (dismiss before showing new one)
let _errorToastId: string | undefined = undefined;

// Timer variables (plain let, not $state — not reactive)
let serverSaveTimer: ReturnType<typeof setTimeout> | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Bumped on every auto-save effect run. A debounced save captures the id at
// schedule time; if a newer run bumps it while the save is in flight, the live
// layout has edits this save did not persist, so its success must not clear the
// dirty/session state for those newer edits.
let _serverSaveScheduleId = 0;

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
 * Shared success epilogue for a durable server save, called by both the manual
 * (handleSaveToServer) and debounced auto-save paths so a successful auto-save
 * leaves the layout in the same state as a manual one.
 *
 * Always (server is healthy): resets the consecutive-failure counter, marks the
 * API available, and dismisses any lingering error toast.
 *
 * When clearDirtyState is true (the default): also sets status to "saved", marks
 * the layout clean, cancels the pending session debounce, records the server
 * echo as the new base, and re-stamps the working copy with it. The copy is kept
 * (not cleared) so a reload can detect divergence against the echoed updatedAt.
 *
 * @param clearDirtyState Pass false for a stale debounced save whose captured
 *   snapshot is older than the live layout (newer unsaved edits arrived while the
 *   save was in flight). The dirty flag and session state are then preserved for
 *   the follow-up save so unload warnings and recovery data survive.
 * @param newUpdatedAt The server-echoed updatedAt from this save's PUT response.
 *   Becomes the base threaded into subsequent PUTs and stamped onto the copy.
 */
export function finalizeSuccessfulSave(
  clearDirtyState = true,
  newUpdatedAt: string | null = null,
): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  _consecutiveSaveFailures = 0;
  setApiAvailable(true);
  if (_errorToastId) {
    toastStore.dismissToast(_errorToastId);
    _errorToastId = undefined;
  }
  if (clearDirtyState) {
    _saveStatus = "saved";
    layoutStore.markClean();
    cancelSessionSave();
    if (newUpdatedAt) setServerBaseUpdatedAt(newUpdatedAt);
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
    _saveStatus = "saving";
    if (serverSaveTimer) {
      clearTimeout(serverSaveTimer);
      serverSaveTimer = null;
      _serverSavePending = false;
    }
    const snapshot = structuredClone($state.snapshot(layoutStore.layout));
    const imagesSnapshot = getImageStore().getUserImages();
    const result = await saveLayoutToServer(
      snapshot,
      imagesSnapshot,
      getServerBaseUpdatedAt(),
    );
    finalizeSuccessfulSave(
      scheduleId === _serverSaveScheduleId,
      result.updatedAt,
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
    toastStore.showToast(
      error instanceof Error ? error.message : "Failed to save layout",
      "error",
    );
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
  return getStorageMode() === "server"
    ? exportAllServer()
    : exportAllBrowser();
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
    await loadFromFile();
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

export function initPersistenceEffects(): void {
  const layoutStore = getLayoutStore();

  // Effect 1: Auto-save layout to localStorage with debouncing
  // Guard: skip clearing on initial run to avoid wiping saved session
  // before App.onMount can restore it (race condition fix)
  let hasEverHadRack = false;
  $effect(() => {
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
    // Capture this run's schedule id; a later run (e.g. an edit during the
    // in-flight save) bumps it and marks an earlier save's success stale.
    const scheduleId = ++_serverSaveScheduleId;
    if (!isApiAvailable()) return;
    if (_consecutiveSaveFailures >= MAX_SAVE_FAILURES) return;
    const layout = layoutStore.layout;
    if (!layout.name) return;
    if (!layoutStore.hasStarted) return;
    if (layout.racks.length === 0) return;
    if (serverSaveTimer) {
      clearTimeout(serverSaveTimer);
    }
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
        const result = await saveLayoutToServer(
          snapshot,
          imagesSnapshot,
          getServerBaseUpdatedAt(),
        );
        // Only clear dirty/session state if no newer save was scheduled while
        // this one was in flight; otherwise newer unsaved edits exist.
        finalizeSuccessfulSave(
          scheduleId === _serverSaveScheduleId,
          result.updatedAt,
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
}
