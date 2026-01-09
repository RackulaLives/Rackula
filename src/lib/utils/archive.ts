/**
 * Archive Utilities
 * Folder-based ZIP archives with YAML and nested image structure
 *
 * Uses dynamic import for JSZip to reduce initial bundle size.
 * The library is only loaded when save/load operations are performed.
 */

import type { Layout } from "$lib/types";
import type { ImageData, ImageStoreMap } from "$lib/types/images";
import { slugify } from "./slug";
import { serializeLayoutToYaml, parseLayoutYaml } from "./yaml";

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
 * Create a folder-based ZIP archive from layout and images
 * Structure: [name]/[name].yaml + [name]/assets/[slug]/[face].[ext]
 */
export async function createFolderArchive(
  layout: Layout,
  images: ImageStoreMap,
): Promise<Blob> {
  const JSZip = await getJSZip();
  const zip = new JSZip();

  // Sanitize folder name using slugify
  const folderName = slugify(layout.name) || "layout";

  // Create main folder
  const folder = zip.folder(folderName);
  if (!folder) {
    throw new Error("Failed to create folder in ZIP");
  }

  // Serialize layout to YAML (excludes runtime fields)
  const yamlContent = await serializeLayoutToYaml(layout);
  folder.file(`${folderName}.yaml`, yamlContent);

  // Add images if present
  if (images.size > 0) {
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
        const deviceFolder = assetsFolder.folder(imageKey);
        if (!deviceFolder) continue;

        // Only save images that have blobs (user uploads, not bundled images)
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
 * Returns layout, images map, and list of any images that failed to load
 */
export async function extractFolderArchive(
  blob: Blob,
): Promise<{ layout: Layout; images: ImageStoreMap; failedImages: string[] }> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(blob);

  // Find the YAML file (should be [name]/[name].yaml)
  const yamlFiles = Object.keys(zip.files).filter(
    (name) => name.endsWith(".yaml") && !name.endsWith("/"),
  );

  if (yamlFiles.length === 0) {
    throw new Error("No YAML file found in archive");
  }

  // Get the first YAML file (we already checked length > 0)
  const yamlPath = yamlFiles[0]!;
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
 * Generate a safe archive filename from layout
 * @param layout - The layout to generate filename for
 * @returns Filename with .Rackula.zip extension
 */
export function generateArchiveFilename(layout: Layout): string {
  const safeName = slugify(layout.name) || "untitled";
  return `${safeName}.Rackula.zip`;
}

/**
 * Download a layout as a folder-based ZIP archive
 * @param layout - The layout to save
 * @param images - Map of device images
 * @param filename - Optional custom filename
 */
export async function downloadArchive(
  layout: Layout,
  images: ImageStoreMap,
  filename?: string,
): Promise<void> {
  // Create the folder archive
  const blob = await createFolderArchive(layout, images);

  // Create object URL for the blob
  const url = URL.createObjectURL(blob);

  try {
    // Create a temporary anchor element
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? generateArchiveFilename(layout);

    // Trigger the download
    anchor.click();
  } finally {
    // Clean up the object URL
    URL.revokeObjectURL(url);
  }
}
