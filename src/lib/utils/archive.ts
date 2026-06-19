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
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import {
  serializeLayoutToYamlWithMetadata,
  serializeLayoutToYaml,
  parseLayoutYaml,
  parseLayoutYamlWithImages,
} from "./yaml";
import { encodeUserImagesToYaml } from "./image-encoding";
import { generateId } from "./device";
import {
  buildFolderName,
  buildYamlFilename,
  extractUuidFromFolderName,
} from "./folder-structure";
import {
  isPlacementKey,
  deviceIdFromPlacementKey,
  layoutIdFromPlacementKey,
  placementKey,
} from "./placement-key";

/**
 * Lazily load JSZip library
 * Cached after first load for subsequent calls
 */
type JSZipConstructor = typeof import("jszip");
type JSZipInstance = ReturnType<JSZipConstructor>;

let jsZipConstructor: JSZipConstructor | null = null;

export async function getJSZip(): Promise<JSZipConstructor> {
  if (!jsZipConstructor) {
    const module = (await import("jszip")) as unknown as {
      default?: JSZipConstructor;
    };
    jsZipConstructor =
      module.default ?? (module as unknown as JSZipConstructor);
  }
  return jsZipConstructor;
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
 * Archive extraction limits (guardrails)
 */
const LIMITS = {
  /** Max ZIP file size: 50MB */
  MAX_ZIP_SIZE_BYTES: 50 * 1024 * 1024,
  /** Max uncompressed size: 250MB */
  MAX_TOTAL_UNCOMPRESSED_BYTES: 250 * 1024 * 1024,
  /** Max files in archive: 500 */
  MAX_ENTRY_COUNT: 500,
  /** Max YAML file size: 5MB */
  MAX_YAML_BYTES: 5 * 1024 * 1024,
  /** Max compression ratio: 100:1 */
  MAX_COMPRESSION_RATIO: 100,
};

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
async function detectZipFormat(zip: JSZipInstance): Promise<ZipFormat> {
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

  // Look for legacy folder format: folder without UUID containing a .yaml file
  // e.g., "5123home/5123home.yaml" (pre-#919 archives)
  const folderYaml = entries.find((e) => {
    const parts = e.split("/");
    return (
      parts.length === 2 &&
      parts[0] !== "" &&
      (parts[1]!.endsWith(".yaml") || parts[1]!.endsWith(".yml"))
    );
  });
  if (folderYaml) {
    const folderName = folderYaml.split("/")[0]!;
    const hasAssetsFolder = entries.some((e) =>
      e.startsWith(`${folderName}/assets/`),
    );
    return {
      type: "old-flat",
      yamlPath: folderYaml,
      assetsPath: hasAssetsFolder ? `${folderName}/assets/` : undefined,
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
 * Extract a folder-based ZIP archive
 * Supports both new format ({Name}-{UUID}/) and old flat format
 * Returns layout, images map, and list of any images that failed to load
 */
export async function extractFolderArchive(
  blob: Blob,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Guardrail: Empty blob
  if (blob.size === 0) {
    throw new Error("Archive file is empty (0 bytes).");
  }

  // Detect plain YAML files by checking ZIP magic bytes (PK = 0x50 0x4B).
  // YAML files don't start with these bytes, so we handle them directly.
  const headerBuffer = await blob.slice(0, 2).arrayBuffer();
  const header = new Uint8Array(headerBuffer);
  const isZip = header[0] === 0x50 && header[1] === 0x4b;

  if (!isZip) {
    // Whole-file cap before parse. Local YAML load allows up to 5MB
    // (MAX_YAML_BYTES) while the server PUT caps a layout at 1MB, so
    // image-heavy YAML that loads locally fails server save loudly. That
    // mismatch is intentional until storage quotas exist (#617).
    if (blob.size > LIMITS.MAX_YAML_BYTES) {
      throw new Error(
        `Layout file too large (${Math.round(blob.size / 1024 / 1024)}MB). Max size is ${Math.round(LIMITS.MAX_YAML_BYTES / 1024 / 1024)}MB.`,
      );
    }
    const yamlText = await blob.text();
    const { layout, images, failedImagesCount } =
      await parseLayoutYamlWithImages(yamlText);
    // finalizeLayoutLoad uses failedImages.length, so surface the count as that
    // many entries; the placeholder strings are never read individually.
    const failedImages = Array.from(
      { length: failedImagesCount },
      (_, i) => `embedded-image-${i}`,
    );
    return { layout, images, failedImages };
  }

  // Guardrail: Max ZIP size
  if (blob.size > LIMITS.MAX_ZIP_SIZE_BYTES) {
    throw new Error(
      `Archive too large (${Math.round(blob.size / 1024 / 1024)}MB). Max size is 50MB.`,
    );
  }

  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(blob);

  // Guardrail: Max entry count
  const entries = Object.keys(zip.files);
  if (entries.length > LIMITS.MAX_ENTRY_COUNT) {
    throw new Error(
      `Archive contains too many files (${entries.length}). Max is 500.`,
    );
  }

  // Guardrail: Total uncompressed size and compression ratio
  // Uses public API (async decompression) instead of private JSZip internals.
  // This decompresses each entry once here; extraction functions later decompress
  // only the YAML/image files they need. The overlap is small and the trade-off
  // (slightly more work vs lower peak memory from not caching all entries) is acceptable.
  let totalUncompressedSize = 0;
  for (const name of entries) {
    const file = zip.files[name];
    if (!file || file.dir) continue;
    const bytes = await file.async("uint8array");
    totalUncompressedSize += bytes.byteLength;
    if (totalUncompressedSize > LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Archive uncompressed size is too large (${Math.round(totalUncompressedSize / 1024 / 1024)}MB).`,
      );
    }
  }

  const ratio = totalUncompressedSize / blob.size;
  if (ratio > LIMITS.MAX_COMPRESSION_RATIO) {
    throw new Error(
      `Archive has suspicious compression ratio (${Math.round(ratio)}:1).`,
    );
  }

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
  zip: JSZipInstance,
  format: ZipFormat,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Extract YAML
  const yamlPath = format.yamlPath;
  if (!yamlPath) {
    throw new Error("YAML path missing for new-format archive");
  }
  const yamlFile = zip.file(yamlPath);
  if (!yamlFile) {
    throw new Error(`YAML file not found: ${yamlPath}`);
  }

  // Guardrail: Max YAML bytes (decompress once, reuse for parsing)
  const yamlBytes = await yamlFile.async("uint8array");
  if (yamlBytes.byteLength > LIMITS.MAX_YAML_BYTES) {
    throw new Error(
      `Layout file too large (${Math.round(yamlBytes.byteLength / 1024 / 1024)}MB).`,
    );
  }

  const yamlContent = new TextDecoder().decode(yamlBytes);
  const layout = await parseLayoutYaml(yamlContent);

  // Derive the layout id from the folder name UUID (canonical persisted identity).
  const layoutId =
    (format.folderName && extractUuidFromFolderName(format.folderName)) ||
    layout.metadata?.id ||
    "";

  // Extract images from assets folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];

  const assetsPath = format.assetsPath;
  if (assetsPath) {
    const imageFiles = Object.keys(zip.files).filter(
      (name) =>
        name.startsWith(assetsPath) && !name.endsWith("/") && isImageFile(name),
    );

    for (const imagePath of imageFiles) {
      // Parse path: folder/assets/[slug]/[filename].[ext]
      const relativePath = imagePath.substring(assetsPath.length);
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
        layoutId,
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
  zip: JSZipInstance,
  format: ZipFormat,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  // Extract YAML from root
  const yamlPath = format.yamlPath;
  if (!yamlPath) {
    throw new Error("YAML path missing for old-format archive");
  }
  const yamlFile = zip.file(yamlPath);
  if (!yamlFile) {
    throw new Error(`YAML file not found: ${yamlPath}`);
  }

  // Guardrail: Max YAML bytes (decompress once, reuse for parsing)
  const yamlBytes = await yamlFile.async("uint8array");
  if (yamlBytes.byteLength > LIMITS.MAX_YAML_BYTES) {
    throw new Error(
      `Layout file too large (${Math.round(yamlBytes.byteLength / 1024 / 1024)}MB).`,
    );
  }

  const yamlContent = new TextDecoder().decode(yamlBytes);
  const layout = await parseLayoutYaml(yamlContent);

  const layoutId = layout.metadata?.id ?? "";

  // Old format: images at root level or in images/ folder
  const images: ImageStoreMap = new Map();
  const failedImages: string[] = [];

  // Find all image files (both at root and in images/ folder)
  const imageFiles = Object.keys(zip.files).filter(
    (path) =>
      !zip.files[path]!.dir && isImageFile(path) && path !== format.yamlPath,
  );

  for (const imagePath of imageFiles) {
    // Normalize path: strip the detected assets prefix (or legacy "images/")
    const prefix = format.assetsPath ?? "images/";
    const normalizedPath = imagePath.startsWith(prefix)
      ? imagePath.substring(prefix.length)
      : imagePath;
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
        layoutId,
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

      const match = /^(.+)-(front|rear)\.\w+$/.exec(filename);
      if (match) {
        const [, deviceSlug, faceToken] = match;
        if (!deviceSlug || !faceToken) continue;
        const face = faceToken as "front" | "rear";

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
  zip: JSZipInstance,
  imagePath: string,
  deviceSlug: string,
  filename: string,
  layoutId: string = "",
): Promise<{
  imageKey?: string;
  face?: "front" | "rear";
  imageData?: ImageData;
  error?: boolean;
}> {
  // Check for device type image: front.{ext} or rear.{ext}
  const deviceTypeFaceMatch = /^(front|rear)\.\w+$/.exec(filename);

  // Check for placement image: {deviceId}-front.{ext} or {deviceId}-rear.{ext}
  const placementFaceMatch = /^(.+)-(front|rear)\.\w+$/.exec(filename);

  let imageKey: string;
  let face: "front" | "rear";

  if (deviceTypeFaceMatch) {
    // Device type image
    imageKey = deviceSlug;
    face = deviceTypeFaceMatch[1] as "front" | "rear";
  } else if (placementFaceMatch) {
    // Placement-specific image — namespace by layout id
    const deviceId = placementFaceMatch[1]!;
    face = placementFaceMatch[2] as "front" | "rear";
    imageKey = placementKey(layoutId, deviceId);
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
  slugifyForFilename,
} from "./folder-structure";
