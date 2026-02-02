/**
 * Layout API routes (UUID-based)
 *
 * When accessed directly (e.g., docker run -p 3001:3001 rackula-api):
 * GET    /layouts       - List all layouts
 * GET    /layouts/:uuid - Get layout by UUID
 * PUT    /layouts/:uuid - Create or update layout
 * DELETE /layouts/:uuid - Delete layout
 *
 * When accessed through nginx proxy (recommended):
 * GET    /api/layouts       - List all layouts
 * GET    /api/layouts/:uuid - Get layout by UUID
 * PUT    /api/layouts/:uuid - Create or update layout
 * DELETE /api/layouts/:uuid - Delete layout
 * (nginx strips /api prefix before forwarding to API)
 */
import { Hono } from "hono";
import { UuidSchema, LayoutFileSchema } from "../schemas/layout";
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

// Get a single layout by UUID
layouts.get("/:uuid", async (c) => {
  const uuid = c.req.param("uuid");

  const uuidResult = UuidSchema.safeParse(uuid);
  if (!uuidResult.success) {
    return c.json({ error: "Invalid layout UUID format" }, 400);
  }

  try {
    const content = await getLayout(uuidResult.data);
    if (!content) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.text(content, 200, { "Content-Type": "text/yaml" });
  } catch (error) {
    console.error(`Failed to get layout ${uuidResult.data}:`, error);
    return c.json({ error: "Failed to get layout" }, 500);
  }
});

// Create or update a layout by UUID
layouts.put("/:uuid", async (c) => {
  const uuid = c.req.param("uuid");

  const uuidResult = UuidSchema.safeParse(uuid);
  if (!uuidResult.success) {
    return c.json({ error: "Invalid layout UUID format" }, 400);
  }

  try {
    const yamlContent = await c.req.text();

    if (!yamlContent.trim()) {
      return c.json({ error: "Request body is empty" }, 400);
    }

    // Validate that metadata.id matches the URL uuid (if metadata exists)
    // This prevents accidentally overwriting a different layout
    try {
      const parsed = JSON.parse(
        JSON.stringify(
          await import("js-yaml").then((y) =>
            y.load(yamlContent, { schema: y.JSON_SCHEMA }),
          ),
        ),
      );
      const layout = LayoutFileSchema.safeParse(parsed);
      if (layout.success && layout.data.metadata?.id) {
        if (
          layout.data.metadata.id.toLowerCase() !==
          uuidResult.data.toLowerCase()
        ) {
          return c.json(
            {
              error: `UUID mismatch: URL has ${uuidResult.data} but metadata.id has ${layout.data.metadata.id}`,
            },
            400,
          );
        }
      }
    } catch {
      // If we can't parse, let saveLayout handle the error
    }

    const result = await saveLayout(yamlContent, uuidResult.data);

    return c.json(
      {
        id: result.id,
        message: result.isNew ? "Layout created" : "Layout updated",
      },
      result.isNew ? 201 : 200,
    );
  } catch (error) {
    console.error(`Failed to save layout ${uuidResult.data}:`, error);

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

// Delete a layout by UUID
layouts.delete("/:uuid", async (c) => {
  const uuid = c.req.param("uuid");

  const uuidResult = UuidSchema.safeParse(uuid);
  if (!uuidResult.success) {
    return c.json({ error: "Invalid layout UUID format" }, 400);
  }

  try {
    const deleted = await deleteLayout(uuidResult.data);
    if (!deleted) {
      return c.json({ error: "Layout not found" }, 404);
    }

    // Assets are now stored inside the layout folder
    // They get deleted when the folder is removed, but we call this
    // for any cleanup of orphaned assets or backwards compatibility
    try {
      await deleteLayoutAssets(uuidResult.data);
    } catch (assetError) {
      console.warn(
        `Failed to delete assets for layout ${uuidResult.data}:`,
        assetError,
      );
    }

    return c.json({ message: "Layout deleted" }, 200);
  } catch (error) {
    console.error(`Failed to delete layout ${uuidResult.data}:`, error);
    return c.json({ error: "Failed to delete layout" }, 500);
  }
});

export default layouts;
