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

/**
 * Share format version. Bumped to 2 when carrier-first container encoding was
 * added (#2290): v2 share links may carry container children (`ci`/`si`) and
 * auto-created carrier flags (`a`). Emitted as the optional `fv` field on v2
 * payloads; absent (treated as 1) on pre-carrier links, which decode fine
 * because the container fields are optional.
 */
export const SHARE_FORMAT_VERSION = 2;

// =============================================================================
// Category Abbreviation Maps
// =============================================================================

/**
 * Category to single-char abbreviation for compression
 */
export const CATEGORY_TO_ABBREV: Record<DeviceCategory, string> = {
  server: "s",
  network: "n",
  firewall: "r",
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
 * Modern share links use U-values for human readability, converted on encode/decode.
 *
 * Container children (carrier-first model): a child carries `ci` (the index of
 * its parent carrier within the same rack's device list) and `si` (the parent
 * slot id), and its `p` is the raw 0-indexed slot position (>= 0), not a human-U
 * rail value. Synthesized carriers carry `a` (auto_created).
 */
export const MinimalDeviceSchema = z.object({
  /** device_type slug */
  t: z.string(),
  /** position: rack-level = U (>= 0.5); container child = raw slot index (>= 0) */
  p: z.number().min(0),
  /** face */
  f: z.enum(["front", "rear", "both"]),
  /** custom name (optional) */
  n: z.string().optional(),
  /** container parent index within this rack's device list (container child) */
  ci: z.number().int().min(0).optional(),
  /** parent slot id (container child) */
  si: z.string().optional(),
  /** auto_created flag (synthesized carrier) */
  a: z.literal(1).optional(),
});

/**
 * Minimal slot schema (container device types). Carries the slot grid so a
 * container's children resolve to real slots after a share round-trip.
 */
export const MinimalSlotSchema = z.object({
  /** slot id */
  id: z.string(),
  /** row index */
  r: z.number().int().min(0),
  /** column index */
  cl: z.number().int().min(0),
  /** width fraction (optional) */
  wf: z.number().optional(),
  /** height units (optional) */
  hu: z.number().optional(),
});

/**
 * Minimal device type schema.
 *
 * Container device types (carriers, shelves, chassis) carry their slot grid
 * (`sl`), slot width (`sw`), and subdevice role (`sr`) so a shared layout's
 * container children round-trip to real slots. `h` allows sub-U heights (>= 0)
 * because the carrier-first model wraps gear under 0.5U.
 */
export const MinimalDeviceTypeSchema = z.object({
  /** slug */
  s: z.string(),
  /** u_height */
  h: z.number().min(0),
  /** manufacturer (optional) */
  mf: z.string().optional(),
  /** model (optional) */
  m: z.string().optional(),
  /** colour (hex) */
  c: z.string(),
  /** category abbreviation */
  x: z.string().length(1),
  /** slots (container device types) */
  sl: z.array(MinimalSlotSchema).optional(),
  /** slot_width (1 = half-width, 2 = full-width) */
  sw: z.union([z.literal(1), z.literal(2)]).optional(),
  /** subdevice_role */
  sr: z.enum(["parent", "child"]).optional(),
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
  /** share format version (>= 2 = carrier-first container encoding); absent = 1 */
  fv: z.number().int().min(1).optional(),
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
