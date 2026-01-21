/**
 * Layout API routes
 * GET    /api/layouts     - List all layouts
 * GET    /api/layouts/:id - Get layout by ID
 * PUT    /api/layouts/:id - Create or update layout
 * DELETE /api/layouts/:id - Delete layout
 */
import { Hono } from "hono";
import { YAMLException } from "js-yaml";
import { ZodError } from "zod";
import { LayoutIdSchema } from "../schemas/layout";
import {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
} from "../storage/filesystem";
import { deleteLayoutAssets } from "../storage/assets";

const layouts = new Hono();

// List all layouts
layouts.get("/", async (c) => {
  try {
    const items = await listLayouts();
    return c.json({ layouts: items });
  } catch (error) {
    console.error("Failed to list layouts:", error);
    return c.json({ error: "Failed to list layouts" }, 500);
  }
});

// Get a single layout
layouts.get("/:id", async (c) => {
  const id = c.req.param("id");

  const idResult = LayoutIdSchema.safeParse(id);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const content = await getLayout(id);
    if (!content) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.text(content, 200, { "Content-Type": "text/yaml" });
  } catch (error) {
    console.error(`Failed to get layout ${id}:`, error);
    return c.json({ error: "Failed to get layout" }, 500);
  }
});

// Create or update a layout
layouts.put("/:id", async (c) => {
  const id = c.req.param("id");

  const idResult = LayoutIdSchema.safeParse(id);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const yamlContent = await c.req.text();

    if (!yamlContent.trim()) {
      return c.json({ error: "Request body is empty" }, 400);
    }

    const result = await saveLayout(yamlContent, id);

    return c.json(
      {
        id: result.id,
        message: result.isNew ? "Layout created" : "Layout updated",
      },
      result.isNew ? 201 : 200,
    );
  } catch (error) {
    console.error(`Failed to save layout ${id}:`, error);

    if (error instanceof YAMLException) {
      return c.json({ error: `Invalid YAML: ${error.message}` }, 400);
    }

    if (error instanceof ZodError) {
      return c.json({ error: `Invalid layout: ${error.message}` }, 400);
    }

    return c.json({ error: "Failed to save layout" }, 500);
  }
});

// Delete a layout
layouts.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const idResult = LayoutIdSchema.safeParse(id);
  if (!idResult.success) {
    return c.json({ error: "Invalid layout ID format" }, 400);
  }

  try {
    const deleted = await deleteLayout(id);
    if (!deleted) {
      return c.json({ error: "Layout not found" }, 404);
    }

    // Best-effort asset cleanup (don't fail if assets can't be deleted)
    try {
      await deleteLayoutAssets(id);
    } catch (assetError) {
      console.warn(`Failed to delete assets for layout ${id}:`, assetError);
    }

    return c.json({ message: "Layout deleted" }, 200);
  } catch (error) {
    console.error(`Failed to delete layout ${id}:`, error);
    return c.json({ error: "Failed to delete layout" }, 500);
  }
});

export default layouts;
