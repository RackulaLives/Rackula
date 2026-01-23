/**
 * Asset storage layer for device images
 * Handles upload/download of images to layout-local assets folder:
 * /data/{Layout Name}-{UUID}/assets/{deviceSlug}/{face}.{ext}
 */
import {
  readFile,
  writeFile,
  unlink,
  mkdir,
  readdir,
  rm,
  stat,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { z } from "zod";
import { getLayoutAssetsDir } from "./filesystem";
import { isUuid } from "../schemas/layout";

// Allowed image types
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_EXTS = new Set(["png", "jpg", "webp"]);
export const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// Schema for device slug validation
// Prevents path traversal attacks
// Note: Device slugs allow underscores (unlike LayoutIdSchema) to support
// device type slugs like "dell_r640" that come from external sources
export const DeviceSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/,
    "Device slug must be lowercase alphanumeric with hyphens/underscores, not starting/ending with special chars",
  );

export interface AssetInfo {
  layoutId: string;
  deviceSlug: string;
  face: "front" | "rear";
  ext: string;
  size: number;
}

/**
 * Validate image content type
 */
export function isValidImageType(contentType: string): boolean {
  return ALLOWED_TYPES.has(contentType);
}

/**
 * Get extension from content type
 * Throws for unsupported content types
 */
export function getExtFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`Unsupported content type: ${contentType}`);
  }
}

/**
 * Get content type from extension
 */
export function getContentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      console.warn(`Unknown extension for content type lookup: ${ext}`);
      return "application/octet-stream";
  }
}

/**
 * Validate layout UUID format
 * Returns null if invalid
 */
function validateLayoutUuid(layoutId: string): string | null {
  return isUuid(layoutId) ? layoutId : null;
}

/**
 * Validate and sanitize device slug
 * Returns null if invalid
 */
function validateDeviceSlug(deviceSlug: string): string | null {
  const parsed = DeviceSlugSchema.safeParse(deviceSlug);
  return parsed.success ? parsed.data : null;
}

/**
 * Check if device slug is valid (exported for use in routes)
 */
export function isValidDeviceSlug(slug: string): boolean {
  return DeviceSlugSchema.safeParse(slug).success;
}

/**
 * Build asset path with validation
 * Returns the full path to the asset file
 * Throws if layoutId, deviceSlug, or ext are invalid
 */
async function buildAssetPath(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
  ext: string,
): Promise<string> {
  const validLayoutId = validateLayoutUuid(layoutId);
  if (!validLayoutId) {
    throw new Error(`Invalid layout UUID: ${layoutId}`);
  }

  const validDeviceSlug = validateDeviceSlug(deviceSlug);
  if (!validDeviceSlug) {
    throw new Error(`Invalid device slug: ${deviceSlug}`);
  }

  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error(`Invalid extension: ${ext}`);
  }

  const assetsDir = await getLayoutAssetsDir(validLayoutId);
  if (!assetsDir) {
    throw new Error(`Layout not found: ${layoutId}`);
  }

  return join(assetsDir, validDeviceSlug, `${face}.${ext}`);
}

/**
 * Save an asset image
 * Creates assets/ folder inside layout folder only when needed
 */
export async function saveAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  if (!isValidImageType(contentType)) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  if (data.byteLength > MAX_SIZE) {
    throw new Error(
      `Image too large: ${data.byteLength} bytes (max ${MAX_SIZE})`,
    );
  }

  const ext = getExtFromContentType(contentType);
  const assetPath = await buildAssetPath(layoutId, deviceSlug, face, ext);

  // Ensure directory exists (creates assets/ and device folder only when needed)
  await mkdir(dirname(assetPath), { recursive: true });

  // Use atomic write pattern: write to unique temp file, then rename
  // Unique suffix prevents races when concurrent writes target the same asset
  const tempPath = `${assetPath}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    // Write to temp file
    await writeFile(tempPath, Buffer.from(data));

    // Atomically replace the target file
    await rename(tempPath, assetPath);

    // Clean up old extensions after successful write
    for (const oldExt of ALLOWED_EXTS) {
      if (oldExt !== ext) {
        try {
          const oldPath = await buildAssetPath(
            layoutId,
            deviceSlug,
            face,
            oldExt,
          );
          await unlink(oldPath);
        } catch {
          // Ignore if doesn't exist
        }
      }
    }
  } catch (error) {
    // Clean up temp file on error
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Get an asset image
 */
export async function getAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
): Promise<{ data: Buffer; contentType: string } | null> {
  // Try each extension
  for (const ext of ALLOWED_EXTS) {
    try {
      const assetPath = await buildAssetPath(layoutId, deviceSlug, face, ext);
      const data = await readFile(assetPath);
      return {
        data,
        contentType: getContentTypeFromExt(ext),
      };
    } catch {
      // Try next extension (or invalid path)
    }
  }

  return null;
}

/**
 * Delete an asset image
 */
export async function deleteAsset(
  layoutId: string,
  deviceSlug: string,
  face: "front" | "rear",
): Promise<boolean> {
  let deleted = false;

  for (const ext of ALLOWED_EXTS) {
    try {
      const assetPath = await buildAssetPath(layoutId, deviceSlug, face, ext);
      await unlink(assetPath);
      deleted = true;
    } catch {
      // Ignore if doesn't exist or invalid path
    }
  }

  return deleted;
}

/**
 * Delete all assets for a layout
 * Removes the assets/ subfolder inside the layout folder
 */
export async function deleteLayoutAssets(layoutId: string): Promise<void> {
  const validLayoutId = validateLayoutUuid(layoutId);
  if (!validLayoutId) {
    throw new Error(`Invalid layout UUID: ${layoutId}`);
  }

  const assetsDir = await getLayoutAssetsDir(validLayoutId);
  if (!assetsDir) {
    // Layout doesn't exist, nothing to delete
    return;
  }

  try {
    await rm(assetsDir, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * List all assets for a layout
 */
export async function listLayoutAssets(layoutId: string): Promise<AssetInfo[]> {
  const validLayoutId = validateLayoutUuid(layoutId);
  if (!validLayoutId) {
    throw new Error(`Invalid layout UUID: ${layoutId}`);
  }

  const assetsDir = await getLayoutAssetsDir(validLayoutId);
  if (!assetsDir) {
    throw new Error(`Layout not found: ${layoutId}`);
  }

  const assets: AssetInfo[] = [];

  try {
    const deviceDirs = await readdir(assetsDir);

    for (const deviceSlug of deviceDirs) {
      // Skip invalid device slugs
      if (!validateDeviceSlug(deviceSlug)) {
        continue;
      }

      const deviceDir = join(assetsDir, deviceSlug);
      try {
        const files = await readdir(deviceDir);

        for (const file of files) {
          const match = file.match(/^(front|rear)\.(png|jpg|webp)$/);
          if (match && match[1] && match[2]) {
            const filePath = join(deviceDir, file);
            try {
              const fileStat = await stat(filePath);
              assets.push({
                layoutId: validLayoutId,
                deviceSlug,
                face: match[1] as "front" | "rear",
                ext: match[2],
                size: fileStat.size,
              });
            } catch {
              // File was deleted between readdir and stat, skip it
            }
          }
        }
      } catch {
        // Skip invalid directories
      }
    }
  } catch {
    // Layout has no assets folder (yet)
  }

  return assets;
}
