/**
 * Layout API routes (UUID-based)
 *
 * When accessed directly (e.g., docker run -p 3001:3001 rackula-api):
 * GET    /layouts                 - List all layouts
 * GET    /layouts/:uuid           - Get layout by UUID
 * PUT    /layouts/:uuid           - Create or update layout
 * DELETE /layouts/:uuid           - Delete layout
 * GET    /layouts/:uuid/snapshots           - List pre-overwrite snapshots
 * GET    /layouts/:uuid/snapshots/:filename - Get a snapshot's YAML content
 * POST   /layouts/:uuid/snapshots           - Upload a losing local copy as a snapshot
 * GET    /layouts/:uuid/pre-carrier-backup  - Get the durable pre-carrier-migration backup
 *
 * When accessed through nginx proxy (recommended), the same routes are
 * available under /api/layouts (nginx strips /api before forwarding).
 *
 * Security note: RACKULA_TRUST_PROXY is opt-in and defaults to false. Rate
 * limiting keys on the client identity; with the fail-safe default the identity
 * comes from the socket peer address, so a directly exposed API is safe out of
 * the box. Set RACKULA_TRUST_PROXY=true only behind a trusted reverse proxy
 * that overwrites X-Real-IP / X-Forwarded-For, otherwise a direct client can
 * spoof those headers to escape throttling. See api/README.md (Deployment
 * behind a reverse proxy).
 *
 * GET and PUT layout responses carry the stored copy's updatedAt in the
 * X-Rackula-Updated-At header. Clients echo it on PUT; a mismatch with the
 * stored copy snapshots the existing YAML before the overwrite.
 */
import { Hono } from "hono";
import * as yaml from "js-yaml";
import { UuidSchema, LayoutFileSchema } from "../schemas/layout";
import type { StorageVariables } from "../storage/driver";
import { SNAPSHOT_NAME_PATTERN } from "../storage/snapshot-name";
import { logger } from "../logger";

/** Header carrying the layout's updatedAt for echo-based conflict detection. */
export const UPDATED_AT_HEADER = "X-Rackula-Updated-At";

/**
 * Header by which the client signals that this PUT is the one-time carrier-first
 * migration write, so the server durably backs up the prior YAML before the
 * overwrite. The enabling value is the exact string "1".
 */
export const PRE_CARRIER_MIGRATION_HEADER = "X-Rackula-Pre-Carrier-Migration";

/** Matches a control character (C0 range plus DEL) anywhere in a string. */
// eslint-disable-next-line no-control-regex -- intentionally rejecting control chars in filenames
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * A snapshot filename param must be a bare {base}~YYYYMMDD-HHMMSS[-N].yaml with
 * no path separators or control characters. Rejecting control chars closes the
 * trailing-newline edge that SNAPSHOT_NAME_PATTERN's unanchored end would
 * otherwise tolerate.
 */
function isValidSnapshotFilenameParam(filename: string): boolean {
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    CONTROL_CHAR_PATTERN.test(filename)
  ) {
    return false;
  }
  return SNAPSHOT_NAME_PATTERN.test(filename);
}

const layouts = new Hono<{ Variables: StorageVariables }>();

// List all layouts
layouts.get("/", async (c) => {
  try {
    const items = await c.get("storage").listLayouts();
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
    const layout = await c.get("storage").getLayout(uuidResult.data);
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
    // This prevents accidentally overwriting a different layout.
    // Parse once, read metadata.id directly — no JSON.stringify round-trip,
    // which would throw on cyclic objects from YAML anchors and silently
    // bypass this guard (see #2067).
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: `Invalid YAML: ${message}` }, 400);
    }

    // Reject non-serializable bodies (circular references from anchors)
    try {
      JSON.stringify(parsed);
    } catch {
      return c.json(
        {
          error:
            "YAML body contains circular references and cannot be processed",
        },
        400,
      );
    }

    const layout = LayoutFileSchema.safeParse(parsed);
    if (layout.success && layout.data.metadata?.id) {
      if (
        layout.data.metadata.id.toLowerCase() !== uuidResult.data.toLowerCase()
      ) {
        return c.json(
          {
            error: `UUID mismatch: URL has ${uuidResult.data} but metadata.id has ${layout.data.metadata.id}`,
          },
          400,
        );
      }
    }

    const result = await c
      .get("storage")
      .saveLayout(
        yamlContent,
        uuidResult.data,
        c.req.header(UPDATED_AT_HEADER),
        {
          preCarrierMigration:
            c.req.header(PRE_CARRIER_MIGRATION_HEADER) === "1",
        },
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
    const deleted = await c.get("storage").deleteLayout(uuidResult.data);
    if (!deleted) {
      return c.json({ error: "Layout not found" }, 404);
    }

    // deleteLayout removes the whole layout subtree, including its assets, so no
    // separate asset cleanup is needed (a second delete would race a concurrent
    // recreate of the same UUID).
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
    const snapshots = await c.get("storage").listSnapshots(uuidResult.data);
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

// Get a single snapshot's YAML content
layouts.get("/:uuid/snapshots/:filename", async (c) => {
  const uuid = c.req.param("uuid");
  const filename = c.req.param("filename");

  const uuidResult = UuidSchema.safeParse(uuid);
  if (!uuidResult.success) {
    return c.json({ error: "Invalid layout UUID format" }, 400);
  }

  if (!isValidSnapshotFilenameParam(filename)) {
    return c.json({ error: "Invalid snapshot filename" }, 400);
  }

  try {
    const content = await c
      .get("storage")
      .getSnapshot(uuidResult.data, filename);
    if (content === null) {
      return c.json({ error: "Snapshot not found" }, 404);
    }

    return c.text(content, 200, { "Content-Type": "text/yaml" });
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to get snapshot ${filename} for layout ${uuidResult.data}`,
    );
    return c.json({ error: "Failed to get snapshot" }, 500);
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

    const result = await c
      .get("storage")
      .saveSnapshot(uuidResult.data, yamlContent);
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

// Get the durable pre-carrier-migration backup (read-only restore source)
layouts.get("/:uuid/pre-carrier-backup", async (c) => {
  const uuid = c.req.param("uuid");

  const uuidResult = UuidSchema.safeParse(uuid);
  if (!uuidResult.success) {
    return c.json({ error: "Invalid layout UUID format" }, 400);
  }

  try {
    const content = await c.get("storage").getPreCarrierBackup(uuidResult.data);
    if (content === null) {
      return c.json({ error: "Pre-carrier backup not found" }, 404);
    }

    return c.text(content, 200, { "Content-Type": "text/yaml" });
  } catch (error) {
    logger.error(
      { err: error },
      `Failed to get pre-carrier backup for layout ${uuidResult.data}`,
    );
    return c.json({ error: "Failed to get pre-carrier backup" }, 500);
  }
});

export default layouts;
