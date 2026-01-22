/**
 * Layout validation schemas for API
 * Mirrors src/lib/schemas/index.ts from main app
 */
import { z } from "zod";

// Minimal schema for layout metadata (we don't need full validation here)
// The full schema validation happens in the SPA
export const LayoutMetadataSchema = z.object({
  version: z.string(),
  name: z.string().min(1, "Layout name is required"),
  racks: z
    .array(
      z.object({
        devices: z.array(z.unknown()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
});

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

export type LayoutMetadata = z.infer<typeof LayoutMetadataSchema>;
export type LayoutListItem = z.infer<typeof LayoutListItemSchema>;
