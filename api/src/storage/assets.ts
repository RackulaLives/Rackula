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
import { logger } from "../logger";

// Allowed image types
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_EXTS = new Set(["png", "jpg", "webp"]);
export const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Detect an image MIME type purely from leading magic bytes.
 *
 * Recognises PNG, JPEG, and WebP. Returns null for anything unrecognised
 * (including GIF, SVG, and text/HTML starting with "<"), so the asset write
 * path can reject untrusted or disallowed content without trusting the
 * declared Content-Type. SVG is excluded by construction (it has no raster
 * magic bytes), which keeps stored-XSS payloads off the app origin.
 *
 * ALLOWLIST PARITY: this is an independent copy of the client detector
 * `detectImageMime` in `src/lib/utils/image-encoding.ts` (the Bun API cannot
 * import the Svelte bundle). The two must accept the same formats; if you
 * change one, change the other. The client pre-check is advisory; this server
 * copy is the authority for what lands on disk.
 */
function detectImageMime(bytes: Uint8Array): string | null {
  // PNG: full 8-byte signature 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // WebP: "RIFF" at 0-3 and "WEBP" at 8-11
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Thrown by saveAsset when a write is rejected because the bytes fail the
 * magic-byte sniff (non-raster, SVG/GIF/polyglot) or sniff to a type that
 * disagrees with the declared Content-Type. This is a client error (the upload
 * is bad), so the route maps it to a 400. A typed error keeps that mapping
 * robust against message rewording (a plain Error would fall through to a 500).
 */
export class AssetRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetRejectedError";
  }
}

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
      logger.warn(`Unknown extension for content type lookup: ${ext}`);
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

  // Magic-byte sniff is the authority for what reaches disk. The declared
  // Content-Type is advisory: a non-image body sent as image/png, an SVG, a
  // GIF, or an HTML/JS polyglot would otherwise be stored and served from the
  // app origin (stored XSS / MIME confusion). Reject when the bytes do not
  // sniff to a raster format, or sniff to a format that disagrees with the
  // declared type. Every disk write (PUT and the migration rewrite) flows
  // through here, so both share this one chokepoint.
  const sniffedType = detectImageMime(new Uint8Array(data));
  if (!sniffedType) {
    throw new AssetRejectedError(
      "Rejected asset: bytes do not match an allowed image format (png/jpeg/webp)",
    );
  }
  if (sniffedType !== contentType) {
    throw new AssetRejectedError(
      `Rejected asset: declared content type ${contentType} disagrees with sniffed type ${sniffedType}`,
    );
  }

  // Derive the on-disk extension from the SNIFFED type, never the declared
  // header, so a spoofed Content-Type cannot pick the filename.
  const ext = getExtFromContentType(sniffedType);
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
