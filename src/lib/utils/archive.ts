/**
 * Archive Utilities
 * Folder-based ZIP archives with YAML and nested image structure
 *
 * Uses dynamic import for JSZip to reduce initial bundle size.
 * The library is only loaded when save/load operations are performed.
 *
 * New folder structure (#919):
 * {Layout Name}-{UUID}/
 * ├── {slugified-name}.rackula.yaml
 * └── assets/                              # only if custom images exist
 *     └── {deviceSlug}/
 *         ├── front.png
 *         └── rear.png
 *
 * Old flat structure (backwards compatible):
 * {layout-name}.yaml                       # YAML at root
 * images/                                  # optional images folder
 *   └── {device-slug}/
 *       └── front.png
 *
 * @see docs/plans/2026-01-22-data-directory-refactor-design.md
 */

import type { Layout, LayoutMetadata } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import {
  serializeLayoutToYamlWithMetadata,
  serializeLayoutToYaml,
} from "./yaml";
import { encodeUserImagesToYaml } from "./image-encoding";
import { generateId } from "./device";
import { buildFolderName, buildYamlFilename } from "./folder-structure";
import {
  isPlacementKey,
  deviceIdFromPlacementKey,
  layoutIdFromPlacementKey,
} from "./placement-key";
import { getJSZip } from "./archive-extract";

// The ZIP reader moved to ./archive-extract; re-export its entry points so
// consumers importing from "$lib/utils/archive" are unchanged. getJSZip is also
// imported above for the writer's own use.
export { getJSZip };
export { extractFolderArchive } from "./archive-extract";

type JSZipConstructor = typeof import("jszip");
type JSZipInstance = ReturnType<JSZipConstructor>;

/**
 * MIME type to file extension mapping
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * File extension to MIME type mapping
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/**
 * Get file extension from MIME type
 */
export function getImageExtension(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "png";
}

/**
 * Get MIME type from filename
 */
export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_MIME[ext] ?? "image/png";
}

/**
 * Check if images map contains any custom images (user uploads with blobs)
 * Bundled images don't have blobs, only URLs
 */
function hasCustomImages(images: ImageStoreMap): boolean {
  for (const deviceImages of images.values()) {
    if (deviceImages.front?.blob || deviceImages.rear?.blob) {
      return true;
    }
  }
  return false;
}

/**
 * A single layout plus its images and optional metadata, the unit the
 * multi-layout export-all archive (#2045) bundles one folder per entry.
 */
export interface LayoutArchiveEntry {
  layout: Layout;
  images: ImageStoreMap;
  metadata?: LayoutMetadata;
}

/**
 * Create one ZIP holding every layout's folder-archive form (#2045).
 *
 * Each layout lands as "{Layout Name}-{UUID}/" with its YAML and optional
 * assets/, so the export-all degraded form (one open layout) reuses this path.
 *
 * @param entries - One entry per layout to include
 * @throws {Error} if entries is empty
 */
export async function createMultiLayoutArchive(
  entries: LayoutArchiveEntry[],
): Promise<Blob> {
  if (entries.length === 0) {
    throw new Error("Cannot create an archive with no layouts");
  }
  const JSZip = await getJSZip();
  const zip = new JSZip();
  for (const entry of entries) {
    await addLayoutFolderToZip(zip, entry.layout, entry.images, entry.metadata);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/**
 * Write a single layout's folder-archive form into a shared JSZip instance.
 *
 * Each layout becomes a "{Layout Name}-{UUID}/" folder containing its YAML and
 * an optional assets/ tree. The multi-layout export-all (#2045) calls this once
 * per layout to share one folder writer across every entry.
 *
 * @param zip - The JSZip instance to write the folder into
 * @param layout - The layout to archive
 * @param images - Map of device images (only user uploads with blobs are included)
 * @param metadata - Optional metadata (will be generated if not provided)
 */
async function addLayoutFolderToZip(
  zip: JSZipInstance,
  layout: Layout,
  images: ImageStoreMap,
  metadata?: LayoutMetadata,
): Promise<void> {
  // Generate or use provided metadata
  const layoutMetadata: LayoutMetadata = metadata ?? {
    id: layout.metadata?.id ?? generateId(),
    name: layout.metadata?.name ?? layout.name,
    schema_version: layout.metadata?.schema_version ?? "1.0",
    description: layout.metadata?.description,
  };

  // Build folder name: "{Layout Name}-{UUID}"
  const folderName = buildFolderName(layoutMetadata.name, layoutMetadata.id);

  // Create main folder
  const folder = zip.folder(folderName);
  if (!folder) {
    throw new Error("Failed to create folder in ZIP");
  }

  // Serialize layout to YAML with metadata section
  const yamlContent = await serializeLayoutToYamlWithMetadata(
    layout,
    layoutMetadata,
  );

  // YAML filename: "{slugified-name}.rackula.yaml"
  const yamlFilename = buildYamlFilename(layoutMetadata.name);
  folder.file(yamlFilename, yamlContent);

  // Add images only if there are custom images (user uploads)
  if (hasCustomImages(images)) {
    const assetsFolder = folder.folder("assets");
    if (!assetsFolder) {
      throw new Error("Failed to create assets folder");
    }

    for (const [imageKey, deviceImages] of images) {
      // Handle placement-specific images (key format: placement-{layoutId}:{deviceId})
      if (isPlacementKey(imageKey)) {
        // Skip images belonging to a different layout (multi-tab: same device UUID, different layout)
        const keyLayoutId = layoutIdFromPlacementKey(imageKey);
        if (keyLayoutId !== undefined && keyLayoutId !== layoutMetadata.id)
          continue;
        const deviceId = deviceIdFromPlacementKey(imageKey);
        // Find the device across all racks to get its device_type slug for the folder path
        const placedDevice = layout.racks
          .flatMap((rack) => rack.devices)
          .find((d) => d.id === deviceId);
        if (!placedDevice) continue;

        const deviceFolder = assetsFolder.folder(placedDevice.device_type);
        if (!deviceFolder) continue;

        // Save as {deviceId}-front.{ext} within the device type folder
        if (deviceImages.front?.blob) {
          const ext = getImageExtension(deviceImages.front.blob.type);
          deviceFolder.file(
            `${deviceId}-front.${ext}`,
            deviceImages.front.blob,
          );
        }

        if (deviceImages.rear?.blob) {
          const ext = getImageExtension(deviceImages.rear.blob.type);
          deviceFolder.file(`${deviceId}-rear.${ext}`, deviceImages.rear.blob);
        }
      } else {
        // Handle device type images (key is the device slug)
        // Only save images that have blobs (user uploads, not bundled images)
        if (!deviceImages.front?.blob && !deviceImages.rear?.blob) {
          continue; // Skip if no user uploads
        }

        const deviceFolder = assetsFolder.folder(imageKey);
        if (!deviceFolder) continue;

        if (deviceImages.front?.blob) {
          const ext = getImageExtension(deviceImages.front.blob.type);
          deviceFolder.file(`front.${ext}`, deviceImages.front.blob);
        }

        if (deviceImages.rear?.blob) {
          const ext = getImageExtension(deviceImages.rear.blob.type);
          deviceFolder.file(`rear.${ext}`, deviceImages.rear.blob);
        }
      }
    }
  }
}

/**
 * Generate the timestamped filename for a multi-layout export-all archive (#2045).
 *
 * Format: rackula-export-YYYYMMDD-HHMMSS.zip (local time). Plain .zip, not the
 * single-layout .Rackula.zip, because the artifact bundles many layout folders
 * rather than being one layout's archive.
 *
 * @param now - Clock to read; defaults to the current time. Injectable for tests.
 */
export function generateExportAllFilename(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `rackula-export-${stamp}.zip`;
}

/**
 * Save a layout as a standalone YAML file, embedding user-uploaded device
 * images as base64 data URLs (#617) so the plain-YAML save no longer drops them.
 *
 * Returns the filename used and the count of images that exceeded the save
 * warning threshold (~100KB), so the caller can surface a single non-blocking
 * "consider optimising" toast.
 */
export async function downloadYamlFile(
  layout: Layout,
  userImages?: ImageStoreMap,
): Promise<{ filename: string; oversized: number }> {
  const { fileSave } = await import("browser-fs-access");
  const { serialized, oversized } = userImages
    ? encodeUserImagesToYaml(userImages)
    : { serialized: undefined, oversized: 0 };
  const yamlContent = await serializeLayoutToYaml(layout, serialized);
  const blob = new Blob([yamlContent], { type: "text/yaml;charset=utf-8" });
  const filename = buildYamlFilename(layout.name);
  await fileSave(blob, {
    fileName: filename,
    extensions: [".yaml"],
    description: "Rackula Layout",
  });
  return { filename, oversized };
}

// Re-export folder structure utilities for convenience
export {
  buildFolderName,
  buildYamlFilename,
  extractUuidFromFolderName,
  isUuid,
} from "./folder-structure";
export { slugifyForFilename } from "./slug";
