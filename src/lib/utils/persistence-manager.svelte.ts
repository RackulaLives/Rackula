// @ts-nocheck
import {
  isApiAvailable,
  setApiAvailable,
  getApiAvailableState,
  hasEverConnectedToApi,
} from "$lib/stores/persistence.svelte";
import {
  saveLayoutToServer,
  checkApiHealth,
  PersistenceError,
} from "$lib/utils/persistence-api";
import { saveSession, clearSession } from "$lib/utils/session-storage";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getUIStore } from "$lib/stores/ui.svelte";
import { getCanvasStore } from "$lib/stores/canvas.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { DRAWER_WIDTH } from "$lib/constants/layout";
import { downloadYamlFile } from "$lib/utils/archive";
import { persistenceDebug } from "$lib/utils/debug";
import { generateShareUrl } from "$lib/utils/share";
import { generateQRCode, canFitInQR } from "$lib/utils/qrcode";
import {
  generateExportSVG,
  exportAsSVG,
  exportAsPNG,
  exportAsJPEG,
  exportAsPDF,
  exportToCSV,
  downloadBlob,
  generateExportFilename,
} from "$lib/utils/export";
import { loadFromFile } from "$lib/utils/load-pipeline";
import type { ExportOptions } from "$lib/types";

// Internal save status (kept for circuit breaker / health check logic, not exported)
type SaveStatusInternal = "idle" | "saving" | "saved" | "error" | "offline" | "disabled";
let _saveStatus = $state<SaveStatusInternal>("idle");

// Circuit breaker
const MAX_SAVE_FAILURES = 3;
let _consecutiveSaveFailures = $state(0);

// Active error toast ID for dedup (dismiss before showing new one)
let _errorToastId: string | undefined = undefined;

// Timer variables (plain let, not $state — not reactive)
let serverSaveTimer: ReturnType<typeof setTimeout> | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function getConsecutiveSaveFailures(): number {
  return _consecutiveSaveFailures;
}

export function handleFitAll(): void {
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const rightOffset = uiStore.rightDrawerOpen ? DRAWER_WIDTH : 0;
  canvasStore.clearSavedViewport();
  canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups, rightOffset);
}

function shouldShowCleanupPrompt(
  operation: "save" | "saveAs" | "export",
): boolean {
  const uiStore = getUIStore();
  const layoutStore = getLayoutStore();
  if (!uiStore.promptCleanupOnSave) return false;
  const unusedTypes = layoutStore.getUnusedCustomDeviceTypes();
  if (unusedTypes.length === 0) return false;
  dialogStore.pendingCleanupOperation = operation;
  dialogStore.open("cleanupPrompt");
  return true;
}

export function resetAndOpenNewRack(): void {
  const layoutStore = getLayoutStore();
  const imageStore = getImageStore();
  layoutStore.resetLayout();
  const usedSlugs = layoutStore.getUsedDeviceTypeSlugs();
  imageStore.cleanupOrphanedImages(usedSlugs);
  dialogStore.open("newRack");
}

export function handleSaveFailure(
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
      "Server save unavailable — working offline. Use Ctrl+S to retry.",
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

export async function handleSaveToServer(isManual = false): Promise<void> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  try {
    _saveStatus = "saving";
    if (serverSaveTimer) {
      clearTimeout(serverSaveTimer);
      serverSaveTimer = null;
    }
    const snapshot = structuredClone($state.snapshot(layoutStore.layout));
    await saveLayoutToServer(snapshot);
    _consecutiveSaveFailures = 0;
    setApiAvailable(true);
    _saveStatus = "saved";
    if (_errorToastId) {
      toastStore.dismissToast(_errorToastId);
      _errorToastId = undefined;
    }
    layoutStore.markClean();
    clearSession();
    if (isManual) {
      toastStore.showToast("Layout saved", "success", 3000);
    }
    if (dialogStore.pendingSaveFirst) {
      dialogStore.pendingSaveFirst = false;
      resetAndOpenNewRack();
    }
  } catch (e) {
    dialogStore.pendingSaveFirst = false;
    persistenceDebug.api("Manual save failed: %O", e);
    handlePersistenceError(e, true, () => handleSaveToServer(isManual));
  }
}

export async function handleSaveAsArchive(): Promise<void> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  try {
    const filename = await downloadYamlFile(layoutStore.layout);
    layoutStore.markClean();
    clearSession();
    toastStore.showToast(`Saved ${filename}`, "success", 3000);
    if (dialogStore.pendingSaveFirst) {
      dialogStore.pendingSaveFirst = false;
      resetAndOpenNewRack();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      dialogStore.pendingSaveFirst = false;
      return;
    }
    dialogStore.pendingSaveFirst = false;
    persistenceDebug.api("Failed to save layout: %O", error);
    toastStore.showToast(
      error instanceof Error ? error.message : "Failed to save layout",
      "error",
    );
  }
}

export function shouldSaveToServer(): boolean {
  return isApiAvailable();
}

export function maybeSave(): void {
  if (shouldShowCleanupPrompt("save")) return;
  if (shouldSaveToServer()) {
    handleSaveToServer(true);
  } else {
    handleSaveAsArchive();
  }
}

export function maybeSaveAs(): void {
  if (shouldShowCleanupPrompt("saveAs")) return;
  handleSaveAsArchive();
}

export function maybeExport(): void {
  if (shouldShowCleanupPrompt("export")) return;
  handleExport();
}

export async function handleLoad(): Promise<void> {
  if (isApiAvailable()) {
    dialogStore.open("load");
  } else {
    await loadFromFile();
  }
}

export async function handleExport(): Promise<void> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  if (!layoutStore.hasRack) {
    toastStore.showToast("No racks to export", "warning");
    return;
  }
  try {
    const shareUrl = generateShareUrl(layoutStore.layout);
    if (canFitInQR(shareUrl)) {
      dialogStore.exportQrCodeDataUrl = await generateQRCode(shareUrl, {
        width: 444,
      });
    } else {
      dialogStore.exportQrCodeDataUrl = undefined;
    }
  } catch {
    dialogStore.exportQrCodeDataUrl = undefined;
  }
  dialogStore.open("export");
}

export function handleShare(): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  if (!layoutStore.hasRack) {
    toastStore.showToast("No rack to share", "warning");
    return;
  }
  dialogStore.open("share");
}

export async function handleExportSubmit(
  options: ExportOptions,
): Promise<void> {
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();
  const imageStore = getImageStore();
  const toastStore = getToastStore();
  dialogStore.close();

  try {
    const racksToExport = options.selectedRackIds?.length
      ? layoutStore.racks.filter((r) => options.selectedRackIds!.includes(r.id))
      : layoutStore.racks;

    if (racksToExport.length === 0) {
      toastStore.showToast("No rack to export", "warning");
      return;
    }

    const exportOptions = {
      ...options,
      displayMode: uiStore.displayMode,
    };

    const images = imageStore.getAllImages();
    const svg = generateExportSVG(
      racksToExport,
      layoutStore.device_types,
      exportOptions,
      images,
      layoutStore.rack_groups,
    );

    const exportViewOrDefault = options.exportView ?? "both";

    const imageFormatHandlers: Record<
      string,
      (
        svg: SVGSVGElement,
        layoutName: string,
        exportView: string,
      ) => Promise<void>
    > = {
      svg: async (svgEl, layoutName, exportView) => {
        const svgString = exportAsSVG(svgEl);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        downloadBlob(
          blob,
          generateExportFilename(layoutName, exportView, "svg"),
        );
        toastStore.showToast("SVG exported successfully", "success");
      },
      png: async (svgEl, layoutName, exportView) => {
        const blob = await exportAsPNG(svgEl);
        downloadBlob(
          blob,
          generateExportFilename(layoutName, exportView, "png"),
        );
        toastStore.showToast("PNG exported successfully", "success");
      },
      jpeg: async (svgEl, layoutName, exportView) => {
        const blob = await exportAsJPEG(svgEl);
        downloadBlob(
          blob,
          generateExportFilename(layoutName, exportView, "jpeg"),
        );
        toastStore.showToast("JPEG exported successfully", "success");
      },
      pdf: async (svgEl, layoutName, exportView) => {
        const svgString = exportAsSVG(svgEl);
        const blob = await exportAsPDF(svgString, options.background);
        downloadBlob(
          blob,
          generateExportFilename(layoutName, exportView, "pdf"),
        );
        toastStore.showToast("PDF exported successfully", "success");
      },
    };

    const handler = imageFormatHandlers[options.format];
    if (handler) {
      await handler(svg, layoutStore.layout.name, exportViewOrDefault);
    } else if (options.format === "csv") {
      const firstRack = racksToExport[0];
      if (!firstRack) {
        throw new Error("No rack available for CSV export");
      }
      const csvContent = exportToCSV(firstRack, layoutStore.device_types);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      downloadBlob(
        blob,
        generateExportFilename(layoutStore.layout.name, null, "csv"),
      );
      const successMsg =
        racksToExport.length > 1
          ? `CSV exported (first rack only - "${firstRack.name}")`
          : "CSV exported successfully";
      toastStore.showToast(successMsg, "success");
    }
  } catch (error) {
    persistenceDebug.api("Export failed: %O", error);
    toastStore.showToast(
      error instanceof Error ? error.message : "Export failed",
      "error",
    );
  }
}

export function flushSessionSave(): void {
  const layoutStore = getLayoutStore();
  if (saveDebounceTimer && layoutStore.hasRack) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    saveSession(layoutStore.layout);
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
      saveDebounceTimer = setTimeout(() => {
        saveSession(currentLayout);
        saveDebounceTimer = null;
      }, 1000);
    } else {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
      // Only clear session if we previously had a rack — prevents wiping
      // localStorage before App.onMount restores the session on page load
      if (hasEverHadRack) {
        clearSession();
      }
    }
    return () => {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
    };
  });

  // Effect 2: Auto-save to server when API is available
  $effect(() => {
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
    serverSaveTimer = setTimeout(async () => {
      _saveStatus = "saving";
      try {
        await saveLayoutToServer(snapshot);
        _consecutiveSaveFailures = 0;
        _saveStatus = "saved";
        if (_errorToastId) {
          getToastStore().dismissToast(_errorToastId);
          _errorToastId = undefined;
        }
        clearSession();
      } catch (e) {
        persistenceDebug.api("Auto-save failed: %O", e);
        handlePersistenceError(e);
      }
      serverSaveTimer = null;
    }, 2000);
    return () => {
      if (serverSaveTimer) {
        clearTimeout(serverSaveTimer);
        serverSaveTimer = null;
      }
    };
  });

  // Effect 3: Periodically check API health when offline
  $effect(() => {
    const apiState = getApiAvailableState();
    if (apiState === null) return;
    if (apiState === true) return;
    if (!hasEverConnectedToApi()) return;
    if (_saveStatus === "disabled") return;
    if (_consecutiveSaveFailures >= MAX_SAVE_FAILURES) return;

    persistenceDebug.health("API offline, starting health check interval");
    const intervalId = setInterval(async () => {
      const healthy = await checkApiHealth();
      if (healthy) {
        persistenceDebug.health("API health check passed, marking available");
        setApiAvailable(true);
        _saveStatus = "idle";
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
}
