/**
 * Unified Load Pipeline
 * Shared logic for loading layouts from API or File
 */
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { getToastStore } from "$lib/stores/toast.svelte";
import { getSelectionStore } from "$lib/stores/selection.svelte";
import { getCanvasStore } from "$lib/stores/canvas.svelte";
import { clearSession } from "./working-copy";
import { setServerBaseUpdatedAt } from "./server-base";
import type { Layout } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import { loadSavedLayout, loadSnapshot, PersistenceError } from "./api";
import { extractFolderArchive } from "$lib/utils/archive";
import { openFilePicker } from "$lib/utils/file";
import { layoutDebug } from "$lib/utils/debug";
import { resolveImageFailureMessages } from "$lib/utils/image-failure-labels";

/**
 * Options for {@link finalizeLayoutLoad}.
 */
export interface FinalizeLayoutLoadOptions {
  /**
   * Success toast message. Pass `null` to suppress the success toast entirely
   * (used by the server-reconciliation path, which shows its own
   * "Loaded ... from server" toast). The partial-image warning toast still
   * shows when images failed to read, regardless of this option.
   */
  successMessage?: string | null;
  /**
   * The device-level store keys of the faces that failed to read (one entry per
   * failed face). When given and resolvable to a placed device, each device gets
   * its own warning toast naming the device and face; otherwise the generic
   * "N images couldn't be read" count toast is used.
   */
  failedKeys?: string[];
}

/**
 * Common layout loading process
 * Updates stores, clears session, and fits view
 */
export function finalizeLayoutLoad(
  layout: Layout,
  images?: ImageStoreMap,
  failedImagesCount: number = 0,
  options: FinalizeLayoutLoadOptions = {},
) {
  const { successMessage = "Layout loaded successfully", failedKeys = [] } =
    options;
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

  // Show status toast. Prefer a per-device, per-face warning naming the device
  // and face; fall back to the generic count when no key resolves to a device.
  const failureMessages = resolveImageFailureMessages(failedKeys, layout);
  if (failureMessages.length > 0) {
    for (const failureMessage of failureMessages) {
      toastStore.showToast(failureMessage, "warning");
    }
  } else if (failedImagesCount > 0) {
    toastStore.showToast(
      `Layout loaded with ${failedImagesCount} image${failedImagesCount > 1 ? "s" : ""} that couldn't be read`,
      "warning",
    );
  } else if (successMessage !== null) {
    toastStore.showToast(successMessage, "success");
  }
}

/**
 * Load layout from Persist API
 */
export async function loadFromApi(uuid: string) {
  const toastStore = getToastStore();

  try {
    const { layout, images, failedImagesCount, failedKeys, updatedAt } =
      await loadSavedLayout(uuid);
    // Record the server's updatedAt as the base for this copy before finalizing,
    // so the first autosave PUT carries the correct last-known timestamp.
    setServerBaseUpdatedAt(updatedAt ?? null);
    finalizeLayoutLoad(layout, images, failedImagesCount, { failedKeys });
    return true;
  } catch (e) {
    let message: string;
    if (e instanceof PersistenceError) {
      if (e.statusCode !== undefined && e.statusCode >= 500) {
        message = "Server error — please try again later";
      } else if (e.statusCode === 404) {
        message = "Layout not found — it may have been deleted";
      } else {
        message = e.message;
      }
    } else {
      message = "Failed to open layout — check your connection";
    }
    toastStore.showToast(message, "error");
    return false;
  }
}

/**
 * Restore a pre-overwrite snapshot as the working copy (#2042).
 *
 * Restore-as-new-write, not an in-place revert: the snapshot YAML is parsed,
 * validated, and adapted through the same {@link loadSnapshot} +
 * {@link finalizeLayoutLoad} pipeline as a normal load, then the server base
 * updatedAt is cleared so the next save snapshots the diverged server copy
 * before overwriting it rather than reverting the stored layout in place.
 */
export async function restoreFromSnapshot(uuid: string, filename: string) {
  const toastStore = getToastStore();

  try {
    const { layout, images, failedImagesCount, failedKeys } =
      await loadSnapshot(uuid, filename);
    // No server base: the next save PUT carries a null last-known timestamp,
    // so the server snapshots its current copy before this restore overwrites it.
    setServerBaseUpdatedAt(null);
    finalizeLayoutLoad(layout, images, failedImagesCount, {
      successMessage: "Snapshot restored",
      failedKeys,
    });
    return true;
  } catch (e) {
    let message: string;
    if (e instanceof PersistenceError) {
      if (e.statusCode !== undefined && e.statusCode >= 500) {
        message = "Server error - please try again later";
      } else if (e.statusCode === 404) {
        message = "Snapshot not found - it may have been pruned";
      } else {
        message = e.message;
      }
    } else {
      message = "Failed to restore snapshot - check your connection";
    }
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
    // A file copy has no server base; autosave will create/re-establish one via
    // its first PUT (the server treats a null last-known updatedAt as a create).
    setServerBaseUpdatedAt(null);
    finalizeLayoutLoad(layout, images, failedImages.length);
    // The loaded file is itself a backup: nothing has changed since export
    getLayoutStore().markExported();
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
