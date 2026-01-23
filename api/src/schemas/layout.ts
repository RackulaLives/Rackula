/**
 * Layout validation schemas for API
 * Mirrors src/lib/schemas/index.ts from main app
 */
import { z } from "zod";

/**
 * UUID pattern for layout metadata.id (anchored for validation)
 * Standard UUID format: 8-4-4-4-12 hex characters with hyphens
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unanchored UUID pattern for extraction from strings
 * Used to find UUIDs within folder names like "My Homelab-550e8400-..."
 */
const UUID_EXTRACTION_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * UUID schema for route parameter validation.
 * Used to validate :uuid route parameters in layout API routes.
 */
export const UuidSchema = z
  .string()
  .regex(UUID_PATTERN, "Invalid layout UUID format");

/**
 * Check if a string is a valid UUID format
 */
export function isUuid(str: string): boolean {
  return UUID_PATTERN.test(str);
}

/**
 * Extract UUID from folder name (format: "{Human Name}-{UUID}")
 * Returns null if folder name doesn't contain a valid UUID
 */
export function extractUuidFromFolderName(folderName: string): string | null {
  const match = folderName.match(UUID_EXTRACTION_PATTERN);
  return match ? match[0] : null;
}

/**
 * Sanitize a string for safe use in filesystem paths
 * Removes path separators and other dangerous characters while keeping readability
 */
function sanitizeForPath(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "-") // Replace path separators and reserved chars
    .replace(/\.\./g, "-") // Prevent directory traversal
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
    .trim()
    .slice(0, 100) // Limit length
    || "untitled"; // Fallback for empty result
}

/**
 * Build folder name from layout name and UUID
 * Format: "{Sanitized Human Name}-{UUID}"
 * Name is sanitized to prevent path traversal attacks
 */
export function buildFolderName(name: string, uuid: string): string {
  return `${sanitizeForPath(name)}-${uuid}`;
}

/**
 * Slugify a layout name to create a safe filename
 * Handles Unicode names by returning "untitled" if result is empty
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, ""); // Remove trailing hyphens after truncation

  // Handle empty results (e.g., all-Unicode names like "...")
  if (!slug) {
    return "untitled";
  }

  return slug;
}

/**
 * Build YAML filename from layout name
 * Format: "{slugified-name}.rackula.yaml"
 */
export function buildYamlFilename(name: string): string {
  return `${slugify(name)}.rackula.yaml`;
}

/**
 * Layout YAML metadata section schema.
 * Part of the data directory refactor (#570, #915).
 * This is the new `metadata:` section in YAML files.
 */
export const LayoutYamlMetadataSchema = z
  .object({
    /** UUID - stable identity across renames/moves */
    id: z
      .string()
      .min(1, "Metadata ID is required")
      .regex(UUID_PATTERN, "Metadata ID must be a valid UUID format"),
    /** Human-readable layout name */
    name: z
      .string()
      .min(1, "Metadata name is required")
      .max(100, "Metadata name must be 100 characters or less"),
    /** Format version for future migrations (e.g., "1.0") */
    schema_version: z.string().min(1, "Schema version is required"),
    /** Optional notes about the layout */
    description: z
      .string()
      .max(1000, "Description must be 1000 characters or less")
      .optional(),
  })
  .passthrough();

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
 * @deprecated Use LayoutYamlMetadataSchema for metadata-only validation,
 * or LayoutFileSchema for full layout file validation.
 * This alias exists for backwards compatibility with code that parses whole layout files.
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
// Layout list item returned by GET /api/layouts (with counts)
// The id field is the layout's UUID from metadata.id (stable identity)
export const LayoutListItemSchema = z.object({
  id: z.string().regex(UUID_PATTERN, "Invalid UUID format"),
  name: z.string(),
  version: z.string(),
  updatedAt: z.string().datetime(),
  rackCount: z.number(),
  deviceCount: z.number(),
  valid: z.boolean().default(true), // false if YAML is corrupted
});

export type LayoutYamlMetadata = z.infer<typeof LayoutYamlMetadataSchema>;
export type LayoutFile = z.infer<typeof LayoutFileSchema>;
/** @deprecated Use LayoutYamlMetadata for metadata-only types, or LayoutFile for full layout file types */
export type LayoutMetadata = z.infer<typeof LayoutMetadataSchema>;
export type LayoutListItem = z.infer<typeof LayoutListItemSchema>;
