/**
 * Layout validation schemas for API
 * Mirrors src/lib/schemas/index.ts from main app
 */
import { z } from "zod";

/**
 * UUID pattern for layout metadata.id
 * Standard UUID format: 8-4-4-4-12 hex characters with hyphens
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Layout YAML metadata section schema.
 * Part of the data directory refactor (#570, #915).
 * This is the new `metadata:` section in YAML files.
 */
export const LayoutYamlMetadataSchema = z.object({
  /** UUID - stable identity across renames/moves */
  id: z.string().regex(UUID_PATTERN, "Invalid UUID format"),
  /** Human-readable layout name */
  name: z.string().min(1, "Metadata name is required"),
  /** Format version for future migrations (e.g., "1.0") */
  schema_version: z.string().min(1, "Schema version is required"),
  /** Optional notes about the layout */
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less")
    .optional(),
});

// Minimal schema for extracting layout info (we don't need full validation here)
// The full schema validation happens in the SPA
export const LayoutFileSchema = z.object({
  version: z.string(),
  name: z.string().min(1, "Layout name is required"),
  /** Optional metadata section for new YAML format (#570, #915) */
  metadata: LayoutYamlMetadataSchema.optional(),
  racks: z
    .array(
      z.object({
        devices: z.array(z.unknown()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
});

/**
 * @deprecated Use LayoutFileSchema instead
 * Kept for backwards compatibility during transition
 */
export const LayoutMetadataSchema = LayoutFileSchema;

// Schema for layout ID (filename without extension)
export const LayoutIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    "Layout ID must be lowercase alphanumeric with hyphens, not starting/ending with hyphen",
  );

// Layout list item returned by GET /api/layouts (with counts)
export const LayoutListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  updatedAt: z.string().datetime(),
  rackCount: z.number(),
  deviceCount: z.number(),
  valid: z.boolean().default(true), // false if YAML is corrupted
});

export type LayoutYamlMetadata = z.infer<typeof LayoutYamlMetadataSchema>;
export type LayoutFile = z.infer<typeof LayoutFileSchema>;
/** @deprecated Use LayoutFile instead */
export type LayoutMetadata = z.infer<typeof LayoutMetadataSchema>;
export type LayoutListItem = z.infer<typeof LayoutListItemSchema>;
