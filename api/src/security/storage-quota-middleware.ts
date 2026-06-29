/**
 * Hono middleware for enforcing storage quotas on layout and asset writes.
 *
 * Counts come from the per-request storage driver (#2625), not the filesystem,
 * so the middleware works behind any backend (filesystem or R2) and never pulls
 * a storage module (and node:fs) into the Workers bundle. Layout quota is only
 * enforced on create (layout does not yet exist), not on update. Asset quota is
 * enforced on every PUT to /assets/:layoutId/:deviceSlug/:face.
 *
 * When a quota is exceeded, returns:
 * - 429 (Too Many Requests) for layout count quota
 * - 507 (Insufficient Storage) for per-layout asset count quota
 *
 * @module storage-quota-middleware
 */

import type { MiddlewareHandler } from "hono";
import { isUuid } from "../schemas/layout";
import { isValidDeviceSlug } from "../storage/asset-validation";
import type { StorageVariables } from "../storage/driver";
import { logger } from "../logger";

/**
 * Configuration for the storage quota middleware.
 */
export interface StorageQuotaMiddlewareConfig {
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
 * All other routes and methods pass through. When both maxLayouts and
 * maxAssetsPerLayout are 0 (unlimited), the middleware is a no-op pass-through.
 */
export function createStorageQuotaMiddleware(
  config: StorageQuotaMiddlewareConfig,
): MiddlewareHandler<{ Variables: StorageVariables }> {
  const { maxLayouts, maxAssetsPerLayout } = config;

  // When both quotas are unlimited, skip all checks
  const unlimited = maxLayouts === 0 && maxAssetsPerLayout === 0;

  return async (c, next) => {
    if (unlimited) {
      await next();
      return;
    }

    const method = c.req.method.toUpperCase();
    // Only enforce quotas on PUT (create/update) requests
    if (method !== "PUT") {
      await next();
      return;
    }

    const { pathname } = new URL(c.req.url);
    const storage = c.get("storage");

    // Layout quota: PUT /layouts/:uuid or PUT /api/layouts/:uuid
    const layoutMatch = pathname.match(/^\/(?:api\/)?layouts\/([^/]+)$/);
    const layoutId = layoutMatch?.[1];
    // Only enforce quota for syntactically valid UUIDs; a malformed id is the
    // route's 400, not a 429 (which would also leak quota saturation).
    if (layoutId && isUuid(layoutId) && maxLayouts > 0) {
      // Only enforce quota on create, not update
      if (await storage.layoutExists(layoutId)) {
        logger.debug(`quota: layout update for ${layoutId}, skipping check`);
        await next();
        return;
      }

      // Create — enforce layout quota.
      // NOTE: count and write are not atomic. Concurrent PUTs can both pass the
      // check before either writes, temporarily exceeding the limit. Accepted
      // trade-off for self-hosted/low-concurrency use.
      const current = await storage.countLayouts();
      if (current >= maxLayouts) {
        logger.warn(`quota: layout quota exceeded ${current}/${maxLayouts}`);
        return c.json(
          {
            error: "Storage quota exceeded",
            message: `Layout limit reached (${current}/${maxLayouts}). Delete existing layouts to create new ones.`,
            current,
            max: maxLayouts,
          },
          429,
        );
      }
    }

    // Asset quota: PUT /assets/:layoutId/:deviceSlug/:face or /api/assets/...
    const assetMatch = pathname.match(
      /^\/(?:api\/)?assets\/([^/]+)\/([^/]+)\/([^/]+)$/,
    );
    if (assetMatch && maxAssetsPerLayout > 0) {
      const assetLayoutId = assetMatch[1];
      const deviceSlug = assetMatch[2];
      const face = assetMatch[3];

      // Only enforce the asset quota for a well-formed target; a malformed
      // deviceSlug/face is the route's 400, not a 507.
      if (
        assetLayoutId &&
        isUuid(assetLayoutId) &&
        deviceSlug &&
        isValidDeviceSlug(deviceSlug) &&
        (face === "front" || face === "rear") &&
        (await storage.layoutExists(assetLayoutId))
      ) {
        const current = await storage.countAssets(assetLayoutId);
        if (current >= maxAssetsPerLayout) {
          // Overwriting an existing asset does not increase the count, so only
          // reject a genuinely new asset at the cap.
          const isReplacement =
            (await storage.getAsset(assetLayoutId, deviceSlug, face)) !== null;
          if (!isReplacement) {
            logger.warn(
              `quota: asset quota exceeded for layout ${assetLayoutId}: ${current}/${maxAssetsPerLayout}`,
            );
            return c.json(
              {
                error: "Storage quota exceeded",
                message: `Asset limit reached for this layout (${current}/${maxAssetsPerLayout}). Remove existing assets to add new ones.`,
                current,
                max: maxAssetsPerLayout,
              },
              507,
            );
          }
        }
      } else {
        // Layout doesn't exist — the route handler will return 404 (or create
        // semantics do not apply to assets).
        logger.debug(
          `quota: layout ${assetLayoutId} not found, skipping asset check`,
        );
      }
    }

    await next();
    return;
  };
}
