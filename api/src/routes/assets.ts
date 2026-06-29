/**
 * Asset API routes
 *
 * When accessed directly (e.g., docker run -p 3001:3001 rackula-api):
 * GET    /assets/:layoutId/:deviceSlug/:face - Get asset image
 * PUT    /assets/:layoutId/:deviceSlug/:face - Upload asset image
 * DELETE /assets/:layoutId/:deviceSlug/:face - Delete asset image
 *
 * When accessed through nginx proxy (recommended):
 * GET    /api/assets/:layoutId/:deviceSlug/:face - Get asset image
 * PUT    /api/assets/:layoutId/:deviceSlug/:face - Upload asset image
 * DELETE /api/assets/:layoutId/:deviceSlug/:face - Delete asset image
 * (nginx strips /api prefix before forwarding to API)
 *
 * Storage goes through the per-request driver (#2625): filesystem on self-host,
 * R2 on Workers. The magic-byte sniff is the shared chokepoint inside
 * driver.saveAsset (asset-validation.ts), so a spoofed Content-Type cannot pick
 * the stored format on either backend.
 */
import { Hono } from "hono";
import { LayoutIdSchema } from "../schemas/layout";
import type { StorageVariables } from "../storage/driver";
import {
  isValidImageType,
  isValidDeviceSlug,
  AssetRejectedError,
  MAX_SIZE,
} from "../storage/asset-validation";
import { logger } from "../logger";

const assets = new Hono<{ Variables: StorageVariables }>();

// Validate face parameter
function isValidFace(face: string): face is "front" | "rear" {
  return face === "front" || face === "rear";
}

// List the on-disk asset faces for a layout. Drives the save-time set-diff
// reconcile (#2530): the client diffs this against the layout's current custom
// faces and deletes the difference. A valid UUID whose layout does not exist
// yet (e.g. a reconcile run before the first YAML PUT lands) is "no assets",
// not an error, so it returns an empty list rather than a 404.
assets.get("/:layoutId", async (c) => {
  const { layoutId } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const list = await c.get("storage").listLayoutAssets(layoutId);
    return c.json({ assets: list }, 200);
  } catch (error) {
    // listLayoutAssets throws "Layout not found" when the layout is absent. For
    // the reconcile that means an empty on-disk set, not a failure.
    if (
      error instanceof Error &&
      error.message.startsWith("Layout not found")
    ) {
      return c.json({ assets: [] }, 200);
    }
    // listLayoutAssets validates the id more strictly (full UUID) than the
    // route's LayoutIdSchema (which also accepts hyphenated non-UUID slugs). A
    // route-valid id that is not a UUID is a bad request, not a server fault.
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid layout UUID")
    ) {
      return c.json({ error: "Invalid layout ID format" }, 400);
    }
    logger.error({ err: error }, `Failed to list assets`);
    return c.json({ error: "Failed to list assets" }, 500);
  }
});

// Get an asset
assets.get("/:layoutId/:deviceSlug/:face", async (c) => {
  const { layoutId, deviceSlug, face } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  if (!isValidFace(face)) {
    return c.json({ error: "Face must be 'front' or 'rear'" }, 400);
  }

  if (!isValidDeviceSlug(deviceSlug)) {
    return c.json({ error: "Invalid device slug format" }, 400);
  }

  try {
    const asset = await c.get("storage").getAsset(layoutId, deviceSlug, face);
    if (!asset) {
      return c.json({ error: "Asset not found" }, 404);
    }

    return c.body(new Uint8Array(asset.data), 200, {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=3600, must-revalidate",
      // Stop MIME sniffing so a polyglot upload cannot be reinterpreted as
      // active content (HTML/JS) when served from the app origin.
      "X-Content-Type-Options": "nosniff",
    });
  } catch (error) {
    logger.error({ err: error }, `Failed to get asset`);
    return c.json({ error: "Failed to get asset" }, 500);
  }
});

// Upload an asset
assets.put("/:layoutId/:deviceSlug/:face", async (c) => {
  const { layoutId, deviceSlug, face } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  if (!isValidFace(face)) {
    return c.json({ error: "Face must be 'front' or 'rear'" }, 400);
  }

  if (!isValidDeviceSlug(deviceSlug)) {
    return c.json({ error: "Invalid device slug format" }, 400);
  }

  const contentType = c.req.header("Content-Type") ?? "";
  if (!isValidImageType(contentType)) {
    return c.json(
      {
        error:
          "Invalid content type. Must be image/png, image/jpeg, or image/webp",
      },
      400,
    );
  }

  // Check Content-Length before reading body (5MB limit)
  const contentLength = c.req.header("Content-Length");
  if (contentLength) {
    const declaredSize = parseInt(contentLength, 10);
    if (!Number.isNaN(declaredSize) && declaredSize > MAX_SIZE) {
      return c.json({ error: "File too large. Maximum size is 5MB" }, 413);
    }
  }

  try {
    const data = await c.req.arrayBuffer();

    // Verify actual size (Content-Length can be spoofed)
    if (data.byteLength > MAX_SIZE) {
      return c.json({ error: "File too large. Maximum size is 5MB" }, 413);
    }

    await c
      .get("storage")
      .saveAsset(layoutId, deviceSlug, face, data, contentType);

    return c.json({ message: "Asset uploaded" }, 200);
  } catch (error) {
    // Client errors (oversized body, rejected bytes) are expected bad uploads,
    // not server faults, so they return a 4xx without logging at error level.
    if (error instanceof Error && error.message.includes("too large")) {
      return c.json({ error: error.message }, 413);
    }

    // saveAsset throws AssetRejectedError when the bytes fail the magic-byte
    // sniff (SVG/GIF/polyglot or a body that disagrees with the declared
    // Content-Type). That is a bad request, not a server fault, so surface it
    // as a 400. The message is a fixed category string that interpolates only
    // server-validated allowlist values, so it is safe to return.
    if (error instanceof AssetRejectedError) {
      return c.json({ error: error.message }, 400);
    }

    // A route-valid-but-non-UUID layout id is a bad request, and a write to a
    // missing layout is a 404, not a server fault. The driver throws these with
    // fixed category prefixes that interpolate only validated values.
    if (error instanceof Error) {
      if (error.message.startsWith("Invalid layout UUID")) {
        return c.json({ error: "Invalid layout ID format" }, 400);
      }
      if (error.message.startsWith("Layout not found")) {
        return c.json({ error: "Layout not found" }, 404);
      }
    }

    // Anything reaching here is an unexpected server fault: log it.
    logger.error({ err: error }, `Failed to save asset`);
    return c.json({ error: "Failed to save asset" }, 500);
  }
});

// Delete an asset
assets.delete("/:layoutId/:deviceSlug/:face", async (c) => {
  const { layoutId, deviceSlug, face } = c.req.param();

  const idResult = LayoutIdSchema.safeParse(layoutId);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  if (!isValidFace(face)) {
    return c.json({ error: "Face must be 'front' or 'rear'" }, 400);
  }

  if (!isValidDeviceSlug(deviceSlug)) {
    return c.json({ error: "Invalid device slug format" }, 400);
  }

  try {
    const deleted = await c
      .get("storage")
      .deleteAsset(layoutId, deviceSlug, face);
    if (!deleted) {
      return c.json({ error: "Asset not found" }, 404);
    }

    return c.json({ message: "Asset deleted" }, 200);
  } catch (error) {
    logger.error({ err: error }, `Failed to delete asset`);
    return c.json({ error: "Failed to delete asset" }, 500);
  }
});

export default assets;
