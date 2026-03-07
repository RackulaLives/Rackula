/**
 * Minimal Share Format Schema
 * Abbreviated keys for URL efficiency
 *
 * Full Layout -> Minimal key mapping:
 * - version -> v
 * - name -> n
 * - rack.name -> r.n
 * - rack.height -> r.h
 * - rack.width -> r.w
 * - rack.devices -> r.d
 * - device.device_type -> t (slug)
 * - device.position -> p
 * - device.face -> f
 * - device.name -> n (optional custom name)
 * - device_types -> dt
 * - deviceType.slug -> s
 * - deviceType.u_height -> h
 * - deviceType.manufacturer -> mf (optional)
 * - deviceType.model -> m (optional)
 * - deviceType.colour -> c
 * - deviceType.category -> x (single char abbreviation)
 */

import { z } from "../zod";
import type { DeviceCategory } from "$lib/types";

// =============================================================================
// Category Abbreviation Maps
// =============================================================================

/**
 * Category to single-char abbreviation for compression
 */
export const CATEGORY_TO_ABBREV: Record<DeviceCategory, string> = {
  server: "s",
  network: "n",
  "patch-panel": "p",
  power: "w",
  storage: "t",
  kvm: "k",
  "av-media": "a",
  cooling: "l",
  shelf: "f",
  blank: "b",
  "cable-management": "c",
  chassis: "h",
  other: "o",
};

/**
 * Single-char abbreviation back to category
 */
export const ABBREV_TO_CATEGORY: Record<string, DeviceCategory> =
  Object.fromEntries(
    Object.entries(CATEGORY_TO_ABBREV).map(([k, v]) => [
      v,
      k as DeviceCategory,
    ]),
  ) as Record<string, DeviceCategory>;

// =============================================================================
// Minimal Format Schemas
// =============================================================================

/**
 * Minimal device placement schema
 * Position accepts decimals for legacy share links (pre-0.7.0 used U-values like 1.5)
 * Modern share links use U-values for human readability, converted on encode/decode
 */
export const MinimalDeviceSchema = z.object({
  /** device_type slug */
  t: z.string(),
  /** position in U (accepts decimals for half-U positions like 1.5) */
  p: z.number().min(0.5),
  /** face */
  f: z.enum(["front", "rear", "both"]),
  /** custom name (optional) */
  n: z.string().optional(),
});

/**
 * Minimal device type schema
 */
export const MinimalDeviceTypeSchema = z.object({
  /** slug */
  s: z.string(),
  /** u_height */
  h: z.number().min(0.5),
  /** manufacturer (optional) */
  mf: z.string().optional(),
  /** model (optional) */
  m: z.string().optional(),
  /** colour (hex) */
  c: z.string(),
  /** category abbreviation */
  x: z.string().length(1),
});

/**
 * Minimal rack schema
 */
export const MinimalRackSchema = z.object({
  /** name */
  n: z.string(),
  /** height */
  h: z.number().int().min(1).max(100),
  /** width (normalized to 10 or 19 for share links) */
  w: z.union([z.literal(10), z.literal(19)]),
  /** devices */
  d: z.array(MinimalDeviceSchema),
});

/**
 * Minimal layout schema (root)
 */
export const MinimalLayoutSchema = z.object({
  /** version */
  v: z.string(),
  /** name */
  n: z.string(),
  /** rack */
  r: MinimalRackSchema,
  /** device_types (only used ones) */
  dt: z.array(MinimalDeviceTypeSchema),
});

// =============================================================================
// V2 Multi-Rack Schemas
// =============================================================================

/**
 * Minimal rack schema with short ID for multi-rack support
 */
export const MinimalRackV2Schema = MinimalRackSchema.extend({
  /** Short sequential rack ID (e.g., "0", "1", "2") */
  i: z.string(),
});

/**
 * Minimal rack group schema for bayed/linked rack configurations
 */
export const MinimalRackGroupSchema = z.object({
  /** Short rack IDs referencing MinimalRackV2.i values */
  rs: z.array(z.string()),
  /** Optional group name */
  n: z.string().optional(),
  /** Layout preset */
  p: z.enum(["bayed", "row"]).optional(),
});

/**
 * Minimal layout schema v2 (multi-rack)
 * Detected by presence of `rs` field (vs `r` for v1)
 */
export const MinimalLayoutV2Schema = z.object({
  /** version */
  v: z.string(),
  /** name */
  n: z.string(),
  /** racks array (v2) */
  rs: z.array(MinimalRackV2Schema),
  /** rack groups (optional) */
  rg: z.array(MinimalRackGroupSchema).optional(),
  /** device_types (only used ones) */
  dt: z.array(MinimalDeviceTypeSchema),
});

// =============================================================================
// Type Exports
// =============================================================================

export type MinimalLayout = z.infer<typeof MinimalLayoutSchema>;
export type MinimalDevice = z.infer<typeof MinimalDeviceSchema>;
export type MinimalDeviceType = z.infer<typeof MinimalDeviceTypeSchema>;
export type MinimalRack = z.infer<typeof MinimalRackSchema>;
export type MinimalRackV2 = z.infer<typeof MinimalRackV2Schema>;
export type MinimalRackGroup = z.infer<typeof MinimalRackGroupSchema>;
export type MinimalLayoutV2 = z.infer<typeof MinimalLayoutV2Schema>;
