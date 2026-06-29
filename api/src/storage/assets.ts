/**
 * Filesystem asset storage for device images.
 *
 * Handles read/write of images to the layout-local assets folder:
 * /data/{Layout Name}-{UUID}/assets/{deviceSlug}/{face}.{ext}
 *
 * The runtime-agnostic validation (magic-byte sniff, allowed formats, device
 * slug rules) lives in ./asset-validation so the R2 driver and the routes share
 * the same chokepoint without importing node:fs. This module is the filesystem
 * implementation, used by the filesystem storage driver.
 */
import {
  readFile,
  writeFile,
  unlink,
  mkdir,
  readdir,
  stat,
  rename,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { getLayoutAssetsDir } from "./filesystem";
import {
  ALLOWED_EXTS,
  validateAssetBytes,
  validateDeviceSlug,
  validateLayoutUuid,
  getContentTypeFromExt,
  type AssetFace,
  type AssetInfo,
} from "./asset-validation";

// Re-export the validation surface so existing importers (routes, tests) keep
// resolving these from ./assets.
export {
  MAX_SIZE,
  AssetRejectedError,
  DeviceSlugSchema,
  isValidImageType,
  isValidDeviceSlug,
  getExtFromContentType,
  getContentTypeFromExt,
  type AssetFace,
  type AssetInfo,
} from "./asset-validation";

/**
 * Build asset path with validation
 * Returns the full path to the asset file
 * Throws if layoutId, deviceSlug, or ext are invalid
 */
async function buildAssetPath(
  layoutId: string,
  deviceSlug: string,
  face: AssetFace,
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
  face: AssetFace,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  // Shared chokepoint: type allowlist, size cap, and magic-byte sniff. The
  // extension is derived from the sniffed bytes, never the declared header.
  const { ext } = validateAssetBytes(data, contentType);
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
  face: AssetFace,
): Promise<{ data: Uint8Array; contentType: string } | null> {
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
  face: AssetFace,
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
                face: match[1] as AssetFace,
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
