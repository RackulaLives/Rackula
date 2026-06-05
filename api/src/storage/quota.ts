/**
 * Storage quota enforcement for layouts and assets.
 *
 * Checks filesystem-based quota limits before write operations.
 * Uses directory counts (fast, no disk-size scanning required).
 *
 * @module quota
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { extractUuidFromFolderName } from "../schemas/layout";
import { logger } from "../logger";

/**
 * Result of a storage quota check.
 */
export interface QuotaCheckResult {
  /** Whether the operation is allowed within quota. */
  allowed: boolean;
  /** Current count against the quota. */
  current: number;
  /** Maximum allowed count. 0 means unlimited. */
  max: number;
}

/**
 * Check whether creating a new layout would exceed the layout count quota.
 *
 * Counts both UUID-suffixed directories (new format) and legacy .yaml/.yml
 * flat files (old format) in the data directory. If `maxLayouts` is 0,
 * returns immediately with `allowed: true` (unlimited mode).
 *
 * @param dataDir - Path to the data directory containing layouts.
 * @param maxLayouts - Maximum number of layouts allowed. 0 = unlimited.
 * @returns Quota check result with current count and max limit.
 */
export async function checkLayoutQuota(
  dataDir: string,
  maxLayouts: number,
): Promise<QuotaCheckResult> {
  if (maxLayouts === 0) {
    logger.debug("quota: layout quota unlimited, skipping check");
    return { allowed: true, current: 0, max: 0 };
  }

  let entries;
  try {
    entries = await readdir(dataDir, { withFileTypes: true });
  } catch (err) {
    // Only allow writes if the directory genuinely doesn't exist yet.
    // Permission errors, I/O failures, or corruption must not silently
    // disable quota enforcement.
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return { allowed: true, current: 0, max: maxLayouts };
    }
    throw err;
  }

  let layoutCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const uuid = extractUuidFromFolderName(entry.name);
      if (uuid) {
        layoutCount += 1;
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))
    ) {
      layoutCount += 1;
    }
  }

  const allowed = layoutCount < maxLayouts;
  logger.debug(
    `quota: layout check ${layoutCount}/${maxLayouts} ${allowed ? "allowed" : "exceeded"}`,
  );

  return { allowed, current: layoutCount, max: maxLayouts };
}

/**
 * Check whether adding an asset to a layout would exceed the per-layout asset quota.
 *
 * Counts image files (png, jpg, jpeg, webp) located directly within each device
 * subdirectory of the layout's assets directory (one level deep).
 * If the assets directory does not exist, current count is 0. If `maxAssetsPerLayout`
 * is 0, returns immediately with `allowed: true` (unlimited mode).
 *
 * @param layoutDir - Path to the layout's folder (containing the assets/ subdirectory).
 * @param maxAssetsPerLayout - Maximum number of assets per layout. 0 = unlimited.
 * @returns Quota check result with current count and max limit.
 */
export async function checkAssetQuota(
  layoutDir: string,
  maxAssetsPerLayout: number,
): Promise<QuotaCheckResult> {
  if (maxAssetsPerLayout === 0) {
    logger.debug("quota: asset quota unlimited, skipping check");
    return { allowed: true, current: 0, max: 0 };
  }

  const assetsDir = join(layoutDir, "assets");

  let deviceDirs;
  try {
    deviceDirs = await readdir(assetsDir, { withFileTypes: true });
  } catch (err) {
    // Only allow writes if the directory genuinely doesn't exist yet.
    // Permission errors, I/O failures, etc. must not silently disable quotas.
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      logger.debug(`quota: no assets directory, 0/${maxAssetsPerLayout}`);
      return { allowed: true, current: 0, max: maxAssetsPerLayout };
    }
    throw err;
  }

  let assetCount = 0;
  for (const deviceDir of deviceDirs) {
    if (deviceDir.isDirectory()) {
      try {
        const files = await readdir(join(assetsDir, deviceDir.name));
        for (const file of files) {
          const ext = file.split(".").pop()?.toLowerCase() ?? "";
          if (
            ext === "png" ||
            ext === "jpg" ||
            ext === "jpeg" ||
            ext === "webp"
          ) {
            assetCount += 1;
          }
        }
      } catch {
        // Directory might have been deleted between readdir and read -- skip
      }
    }
  }

  const allowed = assetCount < maxAssetsPerLayout;
  logger.debug(
    `quota: asset check for ${layoutDir} ${assetCount}/${maxAssetsPerLayout} ${allowed ? "allowed" : "exceeded"}`,
  );

  return { allowed, current: assetCount, max: maxAssetsPerLayout };
}
