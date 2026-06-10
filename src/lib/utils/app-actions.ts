/**
 * App-level actions shared by the toolbar, keyboard shortcuts, and dialogs.
 * Extracted from the persistence manager: these handle view, export, and
 * share workflows rather than storage.
 */
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getUIStore } from "$lib/stores/ui.svelte";
import { getCanvasStore } from "$lib/stores/canvas.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { DRAWER_WIDTH } from "$lib/constants/layout";
import {
  handleSaveToServer,
  handleSaveAsArchive,
  shouldSaveToServer,
} from "$lib/storage";
import { appDebug } from "$lib/utils/debug";
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
import type { ExportFormat, ExportOptions, ExportView } from "$lib/types";

/** Fit all racks into the visible canvas, clearing any saved viewport. */
export function handleFitAll(): void {
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const rightOffset = uiStore.rightDrawerOpen ? DRAWER_WIDTH : 0;
  canvasStore.clearSavedViewport();
  canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups, rightOffset);
}

/**
 * Open the cleanup prompt when unused custom device types exist; returns
 * true if the prompt was shown (the caller should defer its operation).
 */
export function shouldShowCleanupPrompt(
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

/** Reset the layout, drop orphaned images, and open the New Rack dialog. */
export function resetAndOpenNewRack(): void {
  const layoutStore = getLayoutStore();
  const imageStore = getImageStore();
  layoutStore.resetLayout();
  const usedSlugs = layoutStore.getUsedDeviceTypeSlugs();
  imageStore.cleanupOrphanedImages(usedSlugs);
  dialogStore.open("newRack");
}

/** Save to server or download an archive, after the cleanup prompt check. */
export function maybeSave(): void {
  if (shouldShowCleanupPrompt("save")) return;
  if (shouldSaveToServer()) {
    handleSaveToServer(true);
  } else {
    handleSaveAsArchive();
  }
}

/** Download the layout as a YAML archive, after the cleanup prompt check. */
export function maybeSaveAs(): void {
  if (shouldShowCleanupPrompt("saveAs")) return;
  handleSaveAsArchive();
}

/** Open the export dialog, after the cleanup prompt check. */
export function maybeExport(): void {
  if (shouldShowCleanupPrompt("export")) return;
  handleExport();
}

/**
 * Generate the QR code shown in the export dialog, storing the data URL on
 * the dialog store (undefined when the layout cannot fit in a QR code).
 */
export async function prepareExportQrCode(): Promise<void> {
  const layoutStore = getLayoutStore();
  try {
    const shareUrl = generateShareUrl(layoutStore.layout);
    if (shareUrl !== null && canFitInQR(shareUrl)) {
      dialogStore.exportQrCodeDataUrl = await generateQRCode(shareUrl, {
        width: 444,
      });
    } else {
      dialogStore.exportQrCodeDataUrl = undefined;
    }
  } catch {
    dialogStore.exportQrCodeDataUrl = undefined;
  }
}

/** Open the export dialog with a prepared QR code; warns if no racks exist. */
export async function handleExport(): Promise<void> {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  if (!layoutStore.hasRack) {
    toastStore.showToast("No racks to export", "warning");
    return;
  }
  await prepareExportQrCode();
  dialogStore.open("export");
}

/** Open the share dialog; warns if no racks exist. */
export function handleShare(): void {
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  if (!layoutStore.hasRack) {
    toastStore.showToast("No rack to share", "warning");
    return;
  }
  dialogStore.open("share");
}

/** Run the chosen export (SVG, PNG, JPEG, PDF, or CSV) and download it. */
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

    const imageFormatHandlers: Partial<
      Record<
        ExportFormat,
        (
          svg: SVGElement,
          layoutName: string,
          exportView: ExportView,
        ) => Promise<void>
      >
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
    appDebug.export("Export failed: %O", error);
    toastStore.showToast(
      error instanceof Error ? error.message : "Export failed",
      "error",
    );
  }
}
