/**
 * Unified Load Pipeline
 * Shared logic for loading layouts from API or File
 */
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getCanvasStore } from "$lib/stores/canvas.svelte";
import { clearSession } from "$lib/utils/session-storage";
import { analytics } from "$lib/utils/analytics";
import type { Layout } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import { loadSavedLayout, PersistenceError } from "./persistence-api";
import { extractFolderArchive } from "./archive";
import { openFilePicker } from "./file";
import { layoutDebug } from "./debug";

/**
 * Common layout loading process
 * Updates stores, clears session, and fits view
 */
export function finalizeLayoutLoad(
  layout: Layout,
  images?: ImageStoreMap,
  failedImagesCount: number = 0,
) {
  const layoutStore = getLayoutStore();
  const imageStore = getImageStore();
  const toastStore = getToastStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();

  // Always reset images: clear → load bundled base → overlay custom
  imageStore.clearAllImages();
  imageStore.loadBundledImages();

  if (images) {
    for (const [deviceSlug, deviceImages] of images) {
      if (deviceImages.front) {
        imageStore.setDeviceImage(deviceSlug, "front", deviceImages.front);
      }
      if (deviceImages.rear) {
        imageStore.setDeviceImage(deviceSlug, "rear", deviceImages.rear);
      }
    }
  }

  // Load layout into store
  layoutStore.loadLayout(layout);
  layoutStore.markClean();

  // Reset UI state
  clearSession();
  selectionStore.clearSelection();

  // Reset view to center the loaded rack after DOM updates
  requestAnimationFrame(() => {
    canvasStore.fitAll(layoutStore.racks, layoutStore.rack_groups);
  });

  // Show status toast
  if (failedImagesCount > 0) {
    toastStore.showToast(
      `Layout loaded with ${failedImagesCount} image${failedImagesCount > 1 ? "s" : ""} that couldn't be read`,
      "warning",
    );
  } else {
    toastStore.showToast("Layout loaded successfully", "success");
  }

  // Track analytics
  analytics.trackLoad(layoutStore.totalDeviceCount);
}

/**
 * Load layout from Persist API
 */
export async function loadFromApi(uuid: string) {
  const toastStore = getToastStore();

  try {
    const layout = await loadSavedLayout(uuid);
    finalizeLayoutLoad(layout);
    return true;
  } catch (e) {
    const message =
      e instanceof PersistenceError ? e.message : "Failed to open layout";
    toastStore.showToast(message, "error");
    return false;
  }
}

/**
 * Load layout from local .Rackula.zip file
 */
export async function loadFromFile(file?: File) {
  const toastStore = getToastStore();

  try {
    const selectedFile = file ?? (await openFilePicker());
    if (!selectedFile) return false;

    const { layout, images, failedImages } =
      await extractFolderArchive(selectedFile);
    finalizeLayoutLoad(layout, images, failedImages.length);
    return true;
  } catch (error) {
    layoutDebug.state("loadFromFile: failed %O", error);
    toastStore.showToast(
      error instanceof Error ? error.message : "Failed to load layout file",
      "error",
    );
    return false;
  }
}
