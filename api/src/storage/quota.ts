/**
 * Filesystem layout/asset counting for storage quotas.
 *
 * The pure counters ({@link countLayoutsInDir}, {@link countAssetsInDir}) are
 * the single source of the count rule, used by the filesystem storage driver
 * (which the quota middleware consumes via the driver seam, #2625). The
 * `check*Quota` helpers pair a count with a limit.
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
 * Count stored layouts in a data directory.
 *
 * Counts UUID-suffixed directories (new format) and legacy .yaml/.yml flat
 * files (old format). A missing directory counts as zero; permission/I-O errors
 * propagate so a failure never silently disables quota enforcement.
 */
export async function countLayoutsInDir(dataDir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dataDir, { withFileTypes: true });
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return 0;
    }
    throw err;
  }

  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (extractUuidFromFolderName(entry.name)) {
        count += 1;
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Count image assets for a layout: png/jpg/jpeg/webp files located one level
 * deep within each device subdirectory of the layout's assets directory. A
 * missing assets directory counts as zero; other I/O errors propagate.
 */
export async function countAssetsInDir(layoutDir: string): Promise<number> {
  const assetsDir = join(layoutDir, "assets");

  let deviceDirs;
  try {
    deviceDirs = await readdir(assetsDir, { withFileTypes: true });
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return 0;
    }
    throw err;
  }

  let count = 0;
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
            count += 1;
          }
        }
      } catch (err) {
        // A directory deleted between the listing and this read is fine; any
        // other error (permissions, I/O) must surface so quota enforcement is
        // never silently weakened by an incomplete scan.
        if (
          err instanceof Error &&
          (err as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          continue;
        }
        throw err;
      }
    }
  }
  return count;
}

/**
 * Check whether creating a new layout would exceed the layout count quota.
 * If `maxLayouts` is 0, returns immediately with `allowed: true` (unlimited).
 */
export async function checkLayoutQuota(
  dataDir: string,
  maxLayouts: number,
): Promise<QuotaCheckResult> {
  if (maxLayouts === 0) {
    logger.debug("quota: layout quota unlimited, skipping check");
    return { allowed: true, current: 0, max: 0 };
  }

  const current = await countLayoutsInDir(dataDir);
  const allowed = current < maxLayouts;
  logger.debug(
    `quota: layout check ${current}/${maxLayouts} ${allowed ? "allowed" : "exceeded"}`,
  );
  return { allowed, current, max: maxLayouts };
}

/**
 * Check whether adding an asset to a layout would exceed the per-layout asset
 * quota. If `maxAssetsPerLayout` is 0, returns immediately with `allowed: true`
 * (unlimited).
 */
export async function checkAssetQuota(
  layoutDir: string,
  maxAssetsPerLayout: number,
): Promise<QuotaCheckResult> {
  if (maxAssetsPerLayout === 0) {
    logger.debug("quota: asset quota unlimited, skipping check");
    return { allowed: true, current: 0, max: 0 };
  }

  const current = await countAssetsInDir(layoutDir);
  const allowed = current < maxAssetsPerLayout;
  logger.debug(
    `quota: asset check for ${layoutDir} ${current}/${maxAssetsPerLayout} ${allowed ? "allowed" : "exceeded"}`,
  );
  return { allowed, current, max: maxAssetsPerLayout };
}
