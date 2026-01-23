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

import type { Layout } from "$lib/types";
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import { serializeLayoutToYamlWithMetadata, parseLayoutYaml } from "./yaml";
import { generateId } from "./device";
import {
  buildFolderName,
  buildYamlFilename,
  extractUuidFromFolderName,
} from "./folder-structure";

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
 * Supported image file extensions
 */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

/**
 * Check if a file path is an image file
 */
function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Detected ZIP format information
 */
interface ZipFormat {
  /** Format type: new folder structure, old flat structure, or invalid */
  type: "new-folder" | "old-flat" | "invalid";
  /** Folder name for new format (e.g., "My Layout-UUID") */
  folderName?: string;
  /** Path to the YAML file within the zip */
  yamlPath?: string;
  /** Path to assets folder (new format) or images folder (old format) */
  assetsPath?: string;
}

/**
 * Detect the format of a ZIP archive
 * Supports both new folder structure (#919) and old flat structure
 */
async function detectZipFormat(
  zip: import("jszip").default,
): Promise<ZipFormat> {
  const entries = Object.keys(zip.files);

  // Look for new format: folder with UUID and .rackula.yaml
  for (const entry of entries) {
    const parts = entry.split("/");
    if (parts.length >= 2 && parts[0]) {
      const folderName = parts[0];
      const uuid = extractUuidFromFolderName(folderName);
      if (uuid) {
        // Found a UUID folder - look for .rackula.yaml
        const yamlFile = entries.find(
          (e) => e.startsWith(`${folderName}/`) && e.endsWith(".rackula.yaml"),
        );
        if (yamlFile) {
          return {
            type: "new-folder",
            folderName,
            yamlPath: yamlFile,
            assetsPath: `${folderName}/assets/`,
          };
        }
      }
    }
  }

  // Look for old format: flat .yaml file at root
  const flatYaml = entries.find(
    (e) => !e.includes("/") && (e.endsWith(".yaml") || e.endsWith(".yml")),
  );
  if (flatYaml) {
    // Check if there's an images/ folder
    const hasImagesFolder = entries.some((e) => e.startsWith("images/"));
    return {
      type: "old-flat",
      yamlPath: flatYaml,
      assetsPath: hasImagesFolder ? "images/" : undefined,
    };
  }

  return { type: "invalid" };
}

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
 * Supports both new format ({Name}-{UUID}/) and old flat format
 * Returns layout, images map, and list of any images that failed to load
 */
export async function extractFolderArchive(
  blob: Blob,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(blob);

  // Detect format
  const format = await detectZipFormat(zip);

  if (format.type === "invalid") {
    throw new Error("No valid layout file found in archive");
  }

  if (format.type === "new-folder") {
    return await extractNewFormatZip(zip, format);
  }

  // Old flat format
  return await extractOldFormatZip(zip, format);
}

/**
 * Extract from new folder-structure ZIP format (#919)
 * Structure: {Name}-{UUID}/{slug}.rackula.yaml + assets/
 */
async function extractNewFormatZip(
  zip: import("jszip").default,
  format: ZipFormat,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Extract YAML
  const yamlFile = zip.file(format.yamlPath!);
  if (!yamlFile) {
    throw new Error(`YAML file not found: ${format.yamlPath}`);
  }
  const yamlContent = await yamlFile.async("string");
  const layout = await parseLayoutYaml(yamlContent);

  // Extract images from assets folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];

  if (format.assetsPath) {
    const imageFiles = Object.keys(zip.files).filter(
      (name) =>
        name.startsWith(format.assetsPath!) &&
        !name.endsWith("/") &&
        isImageFile(name),
    );

    for (const imagePath of imageFiles) {
      // Parse path: folder/assets/[slug]/[filename].[ext]
      const relativePath = imagePath.substring(format.assetsPath!.length);
      const parts = relativePath.split("/");

      if (parts.length !== 2) continue;

      const deviceSlug = parts[0];
      const filename = parts[1];
      if (!deviceSlug || !filename) continue;

      const result = await extractImageFromZip(
        zip,
        imagePath,
        deviceSlug,
        filename,
      );

      if (result.error) {
        failedImages.push(imagePath);
      } else if (result.imageKey && result.face && result.imageData) {
        const existing = images.get(result.imageKey) ?? {};
        images.set(result.imageKey, {
          ...existing,
          [result.face]: result.imageData,
        });
      }
    }
  }

  return { layout, images, failedImages };
}

/**
 * Extract from old flat ZIP format (backwards compatibility)
 * Structure: {name}.yaml at root, images/ folder optional
 */
async function extractOldFormatZip(
  zip: import("jszip").default,
  format: ZipFormat,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Extract YAML from root
  const yamlFile = zip.file(format.yamlPath!);
  if (!yamlFile) {
    throw new Error(`YAML file not found: ${format.yamlPath}`);
  }
  const yamlContent = await yamlFile.async("string");
  const layout = await parseLayoutYaml(yamlContent);

  // Old format: images at root level or in images/ folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];

  // Find all image files (both at root and in images/ folder)
  const imageFiles = Object.keys(zip.files).filter(
    (path) => !zip.files[path]!.dir && isImageFile(path) && path !== format.yamlPath,
  );

  for (const imagePath of imageFiles) {
    // Normalize path: remove "images/" prefix if present
    const normalizedPath = imagePath.replace(/^images\//, "");
    const parts = normalizedPath.split("/");

    // Expected structure: [slug]/[filename].[ext]
    if (parts.length === 2) {
      const deviceSlug = parts[0];
      const filename = parts[1];
      if (!deviceSlug || !filename) continue;

      const result = await extractImageFromZip(
        zip,
        imagePath,
        deviceSlug,
        filename,
      );

      if (result.error) {
        failedImages.push(imagePath);
      } else if (result.imageKey && result.face && result.imageData) {
        const existing = images.get(result.imageKey) ?? {};
        images.set(result.imageKey, {
          ...existing,
          [result.face]: result.imageData,
        });
      }
    } else if (parts.length === 1) {
      // Single image at root - try to infer slug from filename
      // e.g., "device-slug-front.png"
      const filename = parts[0];
      if (!filename) continue;

      const match = filename.match(/^(.+)-(front|rear)\.\w+$/);
      if (match) {
        const deviceSlug = match[1]!;
        const face = match[2] as "front" | "rear";

        const result = await extractImageFromZip(
          zip,
          imagePath,
          deviceSlug,
          filename,
        );

        if (result.error) {
          failedImages.push(imagePath);
        } else if (result.imageData) {
          const existing = images.get(deviceSlug) ?? {};
          images.set(deviceSlug, {
            ...existing,
            [face]: result.imageData,
          });
        }
      }
    }
  }

  return { layout, images, failedImages };
}

/**
 * Extract a single image from the ZIP file
 * Returns image data or error
 */
async function extractImageFromZip(
  zip: import("jszip").default,
  imagePath: string,
  deviceSlug: string,
  filename: string,
): Promise<{
  imageKey?: string;
  face?: "front" | "rear";
  imageData?: ImageData;
  error?: boolean;
}> {
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
    return {}; // Unknown format, skip
  }

  const imageFile = zip.file(imagePath);
  if (!imageFile) return { error: true };

  try {
    const imageBlob = await imageFile.async("blob");
    const dataUrl = await blobToDataUrl(imageBlob);

    // Graceful degradation: skip images that fail to convert
    if (!dataUrl) {
      console.warn(`Failed to load image: ${imagePath}`);
      return { error: true };
    }

    const imageData: ImageData = {
      blob: imageBlob,
      dataUrl,
      filename,
    };

    return { imageKey, face, imageData };
  } catch (error) {
    // Catch any unexpected errors during blob extraction
    console.warn(`Failed to extract image: ${imagePath}`, error);
    return { error: true };
  }
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
