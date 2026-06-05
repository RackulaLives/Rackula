/**
 * Hono middleware for enforcing storage quotas on layout and asset write operations.
 *
 * Checks layout count and per-layout asset count before allowing write operations.
 * Layout quota is only enforced on create (UUID not found), not on update.
 * Asset quota is enforced on every PUT to /assets/:layoutId/:deviceSlug/:face.
 *
 * When a quota is exceeded, returns:
 * - 429 (Too Many Requests) for layout count quota
 * - 507 (Insufficient Storage) for per-layout asset count quota
 *
 * Both responses include a JSON body with error details.
 *
 * @module storage-quota-middleware
 */

import type { MiddlewareHandler } from "hono";
import { checkLayoutQuota, checkAssetQuota } from "../storage/quota";
import { findFolderByUuid } from "../storage/filesystem";
import { isUuid } from "../schemas/layout";
import { logger } from "../logger";

/**
 * Configuration for the storage quota middleware.
 */
export interface StorageQuotaMiddlewareConfig {
  /** Path to the data directory containing layouts. */
  dataDir: string;
  /** Maximum number of layouts. 0 = unlimited. */
  maxLayouts: number;
  /** Maximum number of assets per layout. 0 = unlimited. */
  maxAssetsPerLayout: number;
}

/**
 * Create a storage quota enforcement middleware for Hono.
 *
 * Applies to:
 * - PUT /layouts/:uuid — checks layout count quota (create only, not update)
 * - PUT /assets/:layoutId/:deviceSlug/:face — checks per-layout asset count quota
 *
 * All other routes and methods are passed through without quota checks.
 * When both maxLayouts and maxAssetsPerLayout are 0 (unlimited), the middleware
 * is a no-op pass-through.
 */
export function createStorageQuotaMiddleware(
  config: StorageQuotaMiddlewareConfig,
): MiddlewareHandler {
  const { dataDir, maxLayouts, maxAssetsPerLayout } = config;

  // When both quotas are unlimited, skip all checks
  const unlimited = maxLayouts === 0 && maxAssetsPerLayout === 0;

  return async (c, next) => {
    if (unlimited) {
      await next();
      return;
    }

    const method = c.req.method.toUpperCase();
    const { pathname } = new URL(c.req.url);

    // Only enforce quotas on PUT (create/update) requests
    if (method !== "PUT") {
      await next();
      return;
    }

    // Layout quota: PUT /layouts/:uuid or PUT /api/layouts/:uuid
    const layoutMatch = pathname.match(/^\/(?:api\/)?layouts\/([^/]+)$/);
    if (layoutMatch) {
      const uuid = layoutMatch[1];

      // Only enforce quota on create, not update
      if (uuid && isUuid(uuid)) {
        const existingFolder = await findFolderByUuid(uuid, dataDir);
        if (existingFolder) {
          logger.debug(`quota: layout update for ${uuid}, skipping check`);
          await next();
          return;
        }
      }

      // Create — enforce layout quota
      // NOTE: Quota check and write are not atomic. Concurrent PUT requests can
      // both pass the check before either writes, temporarily exceeding the limit.
      // This is an accepted trade-off for self-hosted homelab use (low concurrency).
      // Adding file locks would introduce complexity not justified by the threat model.
      const quota = await checkLayoutQuota(dataDir, maxLayouts);
      if (!quota.allowed) {
        logger.warn(
          `quota: layout quota exceeded ${quota.current}/${quota.max}`,
        );
        return c.json(
          {
            error: "Storage quota exceeded",
            message: `Layout limit reached (${quota.current}/${quota.max}). Delete existing layouts to create new ones.`,
            current: quota.current,
            max: quota.max,
          },
          429,
        );
      }
    }

    // Asset quota: PUT /assets/:layoutId/:deviceSlug/:face or PUT /api/assets/:layoutId/:deviceSlug/:face
    const assetMatch = pathname.match(
      /^\/(?:api\/)?assets\/([^/]+)\/([^/]+)\/([^/]+)$/,
    );
    if (assetMatch) {
      const layoutId = assetMatch[1];

      // Find the layout folder to count its assets
      if (layoutId && isUuid(layoutId)) {
        const layoutFolder = await findFolderByUuid(layoutId, dataDir);
        if (layoutFolder) {
          const quota = await checkAssetQuota(layoutFolder, maxAssetsPerLayout);
          if (!quota.allowed) {
            logger.warn(
              `quota: asset quota exceeded for layout ${layoutId}: ${quota.current}/${quota.max}`,
            );
            return c.json(
              {
                error: "Storage quota exceeded",
                message: `Asset limit reached for this layout (${quota.current}/${quota.max}). Remove existing assets to add new ones.`,
                current: quota.current,
                max: quota.max,
              },
              507,
            );
          }
        } else {
          // Layout doesn't exist — the route handler will return 404
          logger.debug(
            `quota: layout ${layoutId} not found, skipping asset check`,
          );
        }
      }
    }

    await next();
    return;
  };
}
