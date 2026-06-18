/**
 * Image Store (v0.1.0)
 * Manages device images in memory during the session
 * Uses Svelte 5 runes for reactivity
 */

import { SvelteMap } from "svelte/reactivity";
import type {
  ImageData,
  DeviceImageData,
  ImageStoreMap,
} from "$lib/types/images";
import { getBundledImage, getBundledImageSlugs } from "$lib/data/bundledImages";

// Module-level store instance (singleton pattern matching other stores)
let imageStoreInstance: ReturnType<typeof createImageStore> | null = null;

/**
 * Create the image store with Svelte 5 runes
 */
function createImageStore() {
  // Internal state using SvelteMap for reactivity
  const images = new SvelteMap<string, DeviceImageData>();

  // Computed count of all images
  const imageCount = $derived(() => {
    let count = 0;
    for (const deviceImages of images.values()) {
      if (deviceImages.front) count++;
      if (deviceImages.rear) count++;
    }
    return count;
  });

  /**
   * Set an image for a device face
   */
  function setDeviceImage(
    deviceId: string,
    face: "front" | "rear",
    data: ImageData,
  ): void {
    const existing = images.get(deviceId) ?? {};
    images.set(deviceId, {
      ...existing,
      [face]: data,
    });
  }

  /**
   * Get an image for a device face
   */
  function getDeviceImage(
    deviceId: string,
    face: "front" | "rear",
  ): ImageData | undefined {
    return images.get(deviceId)?.[face];
  }

  /**
   * Remove a specific face image from a device
   */
  function removeDeviceImage(deviceId: string, face: "front" | "rear"): void {
    const existing = images.get(deviceId);
    if (!existing) return;

    const updated: DeviceImageData = { ...existing };
    delete updated[face];

    // If no images left for this device, remove the entry
    if (!updated.front && !updated.rear) {
      images.delete(deviceId);
    } else {
      images.set(deviceId, updated);
    }
  }

  /**
   * Remove all images for a device
   */
  function removeAllDeviceImages(deviceId: string): void {
    images.delete(deviceId);
  }

  /**
   * Clear all images from the store
   */
  function clearAllImages(): void {
    images.clear();
  }

  /**
   * Get all images (returns a copy for serialization)
   */
  function getAllImages(): ImageStoreMap {
    return new Map(images);
  }

  /**
   * Check if an image exists for a device face
   */
  function hasImage(deviceId: string, face: "front" | "rear"): boolean {
    return !!images.get(deviceId)?.[face];
  }

  /**
   * Get the display URL for an image (url or dataUrl)
   */
  function getImageUrl(
    deviceId: string,
    face: "front" | "rear",
  ): string | undefined {
    const imageData = images.get(deviceId)?.[face];
    if (!imageData) return undefined;
    return imageData.url ?? imageData.dataUrl;
  }

  /**
   * Load bundled images into the store
   * Called on app initialization to make bundled images available
   */
  function loadBundledImages(): void {
    const slugs = getBundledImageSlugs();

    for (const slug of slugs) {
      const frontUrl = getBundledImage(slug, "front");
      const rearUrl = getBundledImage(slug, "rear");

      if (frontUrl) {
        setDeviceImage(slug, "front", {
          url: frontUrl,
          filename: `${slug}.front.webp`,
          isBundled: true,
        });
      }

      if (rearUrl) {
        setDeviceImage(slug, "rear", {
          url: rearUrl,
          filename: `${slug}.rear.webp`,
          isBundled: true,
        });
      }
    }
  }

  /**
   * Get all user-uploaded images (excludes bundled images)
   * Use this for saving to archives
   */
  function getUserImages(): ImageStoreMap {
    const userImages = new SvelteMap<string, DeviceImageData>();

    for (const [deviceId, deviceImages] of images) {
      const filteredImages: DeviceImageData = {};

      if (deviceImages.front && !deviceImages.front.isBundled) {
        filteredImages.front = deviceImages.front;
      }
      if (deviceImages.rear && !deviceImages.rear.isBundled) {
        filteredImages.rear = deviceImages.rear;
      }

      if (filteredImages.front || filteredImages.rear) {
        userImages.set(deviceId, filteredImages);
      }
    }

    return userImages;
  }

  /**
   * Remove images for devices not in the provided list
   * Preserves bundled images regardless of use list
   * Call this after layout changes to prevent orphaned user images
   * @returns Number of device entries removed
   */
  function cleanupOrphanedImages(usedDeviceSlugs: Set<string>): number {
    let removed = 0;

    for (const [deviceId, deviceImages] of images) {
      // Preserve bundled images (they're URL-based, not memory-heavy)
      const hasBundled =
        deviceImages.front?.isBundled || deviceImages.rear?.isBundled;
      if (hasBundled) continue;

      // Remove user images not in use
      if (!usedDeviceSlugs.has(deviceId)) {
        images.delete(deviceId);
        removed++;
      }
    }

    return removed;
  }

  return {
    // Methods
    setDeviceImage,
    getDeviceImage,
    removeDeviceImage,
    removeAllDeviceImages,
    clearAllImages,
    getAllImages,
    hasImage,
    getImageUrl,
    loadBundledImages,
    getUserImages,
    cleanupOrphanedImages,

    // Computed (as getter)
    get imageCount() {
      return imageCount();
    },
  };
}

/**
 * Get the image store singleton
 */
export function getImageStore() {
  if (!imageStoreInstance) {
    imageStoreInstance = createImageStore();
  }
  return imageStoreInstance;
}

/**
 * Reset the image store (for testing)
 */
export function resetImageStore() {
  if (imageStoreInstance) {
    imageStoreInstance.clearAllImages();
  }
  imageStoreInstance = null;
}
