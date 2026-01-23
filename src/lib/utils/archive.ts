/**
 * Archive Utilities
 * Folder-based ZIP archives with YAML and nested image structure
 *
 * Uses dynamic import for JSZip to reduce initial bundle size.
 * The library is only loaded when save/load operations are performed.
 *
 * Folder structure (#919):
 * {Layout Name}-{UUID}/
 * ├── {slugified-name}.rackula.yaml
 * └── assets/                              # only if custom images exist
 *     └── {deviceSlug}/
 *         ├── front.png
 *         └── rear.png
 *
 * @see docs/plans/2026-01-22-data-directory-refactor-design.md
 */

import type { Layout } from "$lib/types";
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import { serializeLayoutToYamlWithMetadata, parseLayoutYaml } from "./yaml";
import { generateId } from "./device";
import { buildFolderName, buildYamlFilename } from "./folder-structure";

/**
 * Lazily load JSZip library
 * Cached after first load for subsequent calls
 */
let jsZipModule: typeof import("jszip") | null = null;

async function getJSZip(): Promise<typeof import("jszip").default> {
  if (!jsZipModule) {
    jsZipModule = await import("jszip");
  }
  return jsZipModule.default;
}

/**
 * MIME type to file extension mapping
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * File extension to MIME type mapping
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
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
 * Metadata for layout export/import
 */
export interface LayoutMetadata {
  /** UUID - stable identity across renames/moves */
  id: string;
  /** Human-readable layout name */
  name: string;
  /** Format version for future migrations (e.g., "1.0") */
  schema_version: string;
  /** Optional notes about the layout */
  description?: string;
}

/**
 * Create a folder-based ZIP archive from layout and images
 *
 * New structure (#919):
 * {Layout Name}-{UUID}/
 * ├── {slugified-name}.rackula.yaml
 * └── assets/                              # only if custom images exist
 *     └── {deviceSlug}/
 *         ├── front.png
 *         └── rear.png
 *
 * @param layout - The layout to archive
 * @param images - Map of device images (only user uploads with blobs are included)
 * @param metadata - Optional metadata (will be generated if not provided)
 */
export async function createFolderArchive(
  layout: Layout,
  images: ImageStoreMap,
  metadata?: LayoutMetadata,
): Promise<Blob> {
  const JSZip = await getJSZip();
  const zip = new JSZip();

  // Generate or use provided metadata
  const layoutMetadata: LayoutMetadata = metadata ?? {
    id: generateId(),
    name: layout.name,
    schema_version: "1.0",
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
      // Handle placement-specific images (key format: placement-{deviceId})
      if (imageKey.startsWith("placement-")) {
        const deviceId = imageKey.replace("placement-", "");
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

  // Generate ZIP blob
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/**
 * Extract a folder-based ZIP archive
 * Supports both new format ({Name}-{UUID}/) and legacy format ({slug}/)
 * Returns layout, images map, and list of any images that failed to load
 */
export async function extractFolderArchive(
  blob: Blob,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(blob);

  // Find the YAML file - supports both .rackula.yaml and .yaml extensions
  const yamlFiles = Object.keys(zip.files).filter(
    (name) =>
      (name.endsWith(".rackula.yaml") || name.endsWith(".yaml")) &&
      !name.endsWith("/"),
  );

  if (yamlFiles.length === 0) {
    throw new Error("No YAML file found in archive");
  }

  // Prefer .rackula.yaml files, fall back to .yaml
  const rackulaYamlFiles = yamlFiles.filter((f) => f.endsWith(".rackula.yaml"));
  const yamlPath =
    rackulaYamlFiles.length > 0 ? rackulaYamlFiles[0]! : yamlFiles[0]!;

  const yamlFile = zip.file(yamlPath);
  if (!yamlFile) {
    throw new Error("Could not read YAML file from archive");
  }

  // Parse YAML content
  const yamlContent = await yamlFile.async("string");
  const layout = await parseLayoutYaml(yamlContent);

  // Find the folder name (parent of the YAML file)
  const folderName = yamlPath.split("/")[0] ?? "layout";

  // Extract images from assets folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];
  const assetsPrefix = `${folderName}/assets/`;

  const imageFiles = Object.keys(zip.files).filter(
    (name) =>
      name.startsWith(assetsPrefix) &&
      !name.endsWith("/") &&
      (name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".webp")),
  );

  for (const imagePath of imageFiles) {
    // Parse path: folder/assets/[slug]/[filename].[ext]
    const relativePath = imagePath.substring(assetsPrefix.length);
    const parts = relativePath.split("/");

    if (parts.length !== 2) continue;

    const deviceSlug = parts[0];
    const filename = parts[1];
    if (!deviceSlug || !filename) continue;

    // Check for device type image: front.{ext} or rear.{ext}
    const deviceTypeFaceMatch = filename.match(/^(front|rear)\.\w+$/);

    // Check for placement image: {deviceId}-front.{ext} or {deviceId}-rear.{ext}
    const placementFaceMatch = filename.match(/^(.+)-(front|rear)\.\w+$/);

    let imageKey: string;
    let face: "front" | "rear";

    if (deviceTypeFaceMatch) {
      // Device type image
      imageKey = deviceSlug;
      face = deviceTypeFaceMatch[1] as "front" | "rear";
    } else if (placementFaceMatch) {
      // Placement-specific image
      const deviceId = placementFaceMatch[1];
      face = placementFaceMatch[2] as "front" | "rear";
      imageKey = `placement-${deviceId}`;
    } else {
      continue; // Unknown format
    }

    const imageFile = zip.file(imagePath);

    if (!imageFile) continue;

    try {
      const imageBlob = await imageFile.async("blob");
      const dataUrl = await blobToDataUrl(imageBlob);

      // Graceful degradation: skip images that fail to convert
      if (!dataUrl) {
        console.warn(`Failed to load image: ${imagePath}`);
        failedImages.push(imagePath);
        continue;
      }

      const imageData: ImageData = {
        blob: imageBlob,
        dataUrl,
        filename,
      };

      const existing = images.get(imageKey) ?? {};
      images.set(imageKey, {
        ...existing,
        [face]: imageData,
      });
    } catch (error) {
      // Catch any unexpected errors during blob extraction
      console.warn(`Failed to extract image: ${imagePath}`, error);
      failedImages.push(imagePath);
    }
  }

  return { layout, images, failedImages };
}

/**
 * Convert a Blob to a data URL
 * Returns null on failure for graceful degradation
 */
function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Type-safe result handling
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        // Unexpected result type (ArrayBuffer when using readAsDataURL is unusual)
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null); // Graceful failure instead of reject
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a safe archive filename from layout with UUID
 *
 * New format (#919): {Layout Name}-{UUID}.zip
 * Example: "My Homelab-550e8400-e29b-41d4-a716-446655440000.zip"
 *
 * @param layout - The layout to generate filename for
 * @param metadata - Optional metadata with UUID (will be generated if not provided)
 * @returns Filename with .zip extension
 */
export function generateArchiveFilename(
  layout: Layout,
  metadata?: LayoutMetadata,
): string {
  const layoutMetadata: LayoutMetadata = metadata ?? {
    id: generateId(),
    name: layout.name,
    schema_version: "1.0",
  };

  return `${buildFolderName(layoutMetadata.name, layoutMetadata.id)}.zip`;
}

/**
 * Download a layout as a folder-based ZIP archive
 * @param layout - The layout to save
 * @param images - Map of device images
 * @param metadata - Optional metadata (will be generated if not provided)
 * @param filename - Optional custom filename (overrides generated name)
 */
export async function downloadArchive(
  layout: Layout,
  images: ImageStoreMap,
  metadata?: LayoutMetadata,
  filename?: string,
): Promise<void> {
  // Generate metadata if not provided (used for both archive and filename)
  const layoutMetadata: LayoutMetadata = metadata ?? {
    id: generateId(),
    name: layout.name,
    schema_version: "1.0",
  };

  // Create the folder archive with metadata
  const blob = await createFolderArchive(layout, images, layoutMetadata);

  // Create object URL for the blob
  const url = URL.createObjectURL(blob);

  try {
    // Create a temporary anchor element
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      filename ?? generateArchiveFilename(layout, layoutMetadata);

    // Trigger the download
    anchor.click();
  } finally {
    // Clean up the object URL
    URL.revokeObjectURL(url);
  }
}

// Re-export folder structure utilities for convenience
export {
  buildFolderName,
  buildYamlFilename,
  extractUuidFromFolderName,
  isUuid,
  slugifyForFilename,
} from "./folder-structure";
