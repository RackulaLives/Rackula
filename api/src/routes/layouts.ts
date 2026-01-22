/**
 * Layout API routes
 * GET    /api/layouts     - List all layouts
 * GET    /api/layouts/:id - Get layout by ID
 * PUT    /api/layouts/:id - Create or update layout
 * DELETE /api/layouts/:id - Delete layout
 */
import { Hono } from "hono";
import * as yaml from "js-yaml";
import { LayoutIdSchema, LayoutMetadataSchema } from "../schemas/layout";
import {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
  layoutExists,
  slugify,
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
    const content = await getLayout(idResult.data);
    if (!content) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.text(content, 200, { "Content-Type": "text/yaml" });
  } catch (error) {
    console.error(`Failed to get layout ${idResult.data}:`, error);
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

    // Parse YAML to check for rename conflicts before saving
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: `Invalid YAML: ${message}` }, 400);
    }

    const metadata = LayoutMetadataSchema.safeParse(parsed);
    if (!metadata.success) {
      const issues = metadata.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return c.json({ error: `Invalid layout metadata: ${issues}` }, 400);
    }

    // Check for rename conflicts
    const newId = slugify(metadata.data.name);
    if (newId !== idResult.data) {
      const exists = await layoutExists(newId);
      if (exists) {
        return c.json(
          {
            error: `Cannot rename: a layout with the name "${metadata.data.name}" already exists`,
          },
          409,
        );
      }
    }

    const result = await saveLayout(yamlContent, idResult.data);

    return c.json(
      {
        id: result.id,
        message: result.isNew ? "Layout created" : "Layout updated",
      },
      result.isNew ? 201 : 200,
    );
  } catch (error) {
    console.error(`Failed to save layout ${idResult.data}:`, error);

    // saveLayout throws Error with message prefixes for validation failures
    if (error instanceof Error) {
      const isValidationError =
        error.message.startsWith("Invalid YAML:") ||
        error.message.startsWith("Invalid layout metadata:");
      if (isValidationError) {
        return c.json({ error: error.message }, 400);
      }
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
    const deleted = await deleteLayout(idResult.data);
    if (!deleted) {
      return c.json({ error: "Layout not found" }, 404);
    }

    // Best-effort asset cleanup (don't fail if assets can't be deleted)
    try {
      await deleteLayoutAssets(idResult.data);
    } catch (assetError) {
      console.warn(
        `Failed to delete assets for layout ${idResult.data}:`,
        assetError,
      );
    }

    return c.json({ message: "Layout deleted" }, 200);
  } catch (error) {
    console.error(`Failed to delete layout ${idResult.data}:`, error);
    return c.json({ error: "Failed to delete layout" }, 500);
  }
});

export default layouts;
