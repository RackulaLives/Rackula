/**
 * Layout API routes (UUID-based)
 *
 * When accessed directly (e.g., docker run -p 3001:3001 rackula-api):
 * GET    /layouts                 - List all layouts
 * GET    /layouts/:uuid           - Get layout by UUID
 * PUT    /layouts/:uuid           - Create or update layout
 * DELETE /layouts/:uuid           - Delete layout
 * GET    /layouts/:uuid/snapshots - List pre-overwrite snapshots
 * POST   /layouts/:uuid/snapshots - Upload a losing local copy as a snapshot
 *
 * When accessed through nginx proxy (recommended), the same routes are
 * available under /api/layouts (nginx strips /api before forwarding).
 *
 * GET and PUT layout responses carry the stored copy's updatedAt in the
 * X-Rackula-Updated-At header. Clients echo it on PUT; a mismatch with the
 * stored copy snapshots the existing YAML before the overwrite.
 */
import { Hono } from "hono";
import * as yaml from "js-yaml";
import { UuidSchema, LayoutFileSchema } from "../schemas/layout";
import {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
  listSnapshots,
  saveSnapshot,
} from "../storage/filesystem";
import { deleteLayoutAssets } from "../storage/assets";
import { logger } from "../logger";

/** Header carrying the layout's updatedAt for echo-based conflict detection. */
export const UPDATED_AT_HEADER = "X-Rackula-Updated-At";

const layouts = new Hono();

// List all layouts
layouts.get("/", async (c) => {
  try {
    const items = await listLayouts();
    return c.json({ layouts: items });
  } catch (error) {
    logger.error({ err: error }, "Failed to list layouts");
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
    const layout = await getLayout(uuidResult.data);
    if (!layout) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.text(layout.content, 200, {
      "Content-Type": "text/yaml",
      [UPDATED_AT_HEADER]: layout.updatedAt,
    });
  } catch (error) {
    logger.error({ err: error }, `Failed to get layout ${uuidResult.data}`);
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

    const result = await saveLayout(
      yamlContent,
      uuidResult.data,
      c.req.header(UPDATED_AT_HEADER),
    );

    c.header(UPDATED_AT_HEADER, result.updatedAt);
    return c.json(
      {
        id: result.id,
        updatedAt: result.updatedAt,
        message: result.isNew ? "Layout created" : "Layout updated",
      },
      result.isNew ? 201 : 200,
    );
  } catch (error) {
    logger.error({ err: error }, `Failed to save layout ${uuidResult.data}`);

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
      logger.warn(
        { err: assetError },
        `Failed to delete assets for layout ${uuidResult.data}`,
      );
    }

    return c.json({ message: "Layout deleted" }, 200);
  } catch (error) {
    logger.error({ err: error }, `Failed to delete layout ${uuidResult.data}`);
    return c.json({ error: "Failed to delete layout" }, 500);
  }
});

// List pre-overwrite snapshots for a layout
layouts.get("/:uuid/snapshots", async (c) => {
  const uuid = c.req.param("uuid");

  const uuidResult = UuidSchema.safeParse(uuid);
  if (!uuidResult.success) {
    return c.json({ error: "Invalid layout UUID format" }, 400);
  }

  try {
    const snapshots = await listSnapshots(uuidResult.data);
    if (snapshots === null) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.json({ snapshots });
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to list snapshots for layout ${uuidResult.data}`,
    );
    return c.json({ error: "Failed to list snapshots" }, 500);
  }
});

// Upload a losing local copy as a snapshot
layouts.post("/:uuid/snapshots", async (c) => {
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

    try {
      yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: `Invalid YAML: ${message}` }, 400);
    }

    const result = await saveSnapshot(uuidResult.data, yamlContent);
    if (!result) {
      return c.json({ error: "Layout not found" }, 404);
    }

    return c.json(
      { filename: result.filename, message: "Snapshot saved" },
      201,
    );
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to save snapshot for layout ${uuidResult.data}`,
    );
    return c.json({ error: "Failed to save snapshot" }, 500);
  }
});

export default layouts;
