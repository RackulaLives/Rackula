/**
 * Asset API routes
 * GET    /api/assets/:layoutId/:deviceSlug/:face - Get asset image
 * PUT    /api/assets/:layoutId/:deviceSlug/:face - Upload asset image
 * DELETE /api/assets/:layoutId/:deviceSlug/:face - Delete asset image
 */
import { Hono } from "hono";
import { LayoutIdSchema } from "../schemas/layout";
import {
  getAsset,
  saveAsset,
  deleteAsset,
  isValidImageType,
} from "../storage/assets";

const assets = new Hono();

// Validate face parameter
function isValidFace(face: string): face is "front" | "rear" {
  return face === "front" || face === "rear";
}

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

  try {
    const asset = await getAsset(layoutId, deviceSlug, face);
    if (!asset) {
      return c.json({ error: "Asset not found" }, 404);
    }

    return c.body(new Uint8Array(asset.data), 200, {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=3600, must-revalidate",
    });
  } catch (error) {
    console.error(`Failed to get asset:`, error);
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

  try {
    const data = await c.req.arrayBuffer();
    await saveAsset(layoutId, deviceSlug, face, data, contentType);

    return c.json({ message: "Asset uploaded" }, 200);
  } catch (error) {
    console.error(`Failed to save asset:`, error);

    if (error instanceof Error && error.message.includes("too large")) {
      return c.json({ error: error.message }, 413);
    }

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

  try {
    const deleted = await deleteAsset(layoutId, deviceSlug, face);
    if (!deleted) {
      return c.json({ error: "Asset not found" }, 404);
    }

    return c.json({ message: "Asset deleted" }, 200);
  } catch (error) {
    console.error(`Failed to delete asset:`, error);
    return c.json({ error: "Failed to delete asset" }, 500);
  }
});

export default assets;
