/**
 * Share URL Encoding/Decoding
 * Converts Layout <-> MinimalLayout <-> compressed base64url string
 *
 * Position handling:
 * - Internal state uses internal units (1/6U): position 9 = U1.5
 * - Share links use human U-values for readability: position 1.5 = U1.5
 * - Conversion happens on encode (internal→U) and decode (U→internal)
 *
 * Schema versions:
 * - v1: Single rack (`r` field) — legacy, decode-only
 * - v2: Multi-rack (`rs` field) with optional rack groups (`rg`)
 *
 * Encoding formats:
 * - New (default): lz-string compressToEncodedURIComponent
 * - Legacy (decode-only): pako gzip + base64url
 */

import pako from "pako";
import LZString from "lz-string";
import type { Layout, DeviceType, PlacedDevice, RackGroup } from "$lib/types";
import {
  MinimalLayoutSchema,
  MinimalLayoutV2Schema,
  CATEGORY_TO_ABBREV,
  ABBREV_TO_CATEGORY,
  SHARE_FORMAT_VERSION,
  type MinimalLayout,
  type MinimalLayoutV2,
  type MinimalDeviceType,
  type MinimalDevice,
  type MinimalRackV2,
  type MinimalRackGroup,
} from "$lib/schemas/share";
import { generateId } from "./device";
import { createDefaultRack } from "./serialization";
import { toHumanUnits, toInternalUnits } from "./position";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize rack width to valid share format values (10 or 19)
 * Maps non-standard widths (21, 23) to 19
 */
function normalizeRackWidth(width: number): 10 | 19 {
  return width === 10 ? 10 : 19;
}

/**
 * Convert a rack's devices to minimal format.
 *
 * Container children (carrier-first) are encoded with `ci` (the parent
 * carrier's index in this same array), `si` (the parent slot id), and a raw
 * 0-indexed slot position (not a human-U rail value). Synthesized carriers
 * carry `a: 1`. The array order is preserved so `ci` indices stay valid on
 * decode.
 */
function convertDevices(devices: PlacedDevice[]): MinimalDevice[] {
  // Map each device id to its index so a child can reference its parent
  // carrier positionally (ids are regenerated on decode).
  const indexById = new Map<string, number>();
  devices.forEach((d, index) => indexById.set(d.id, index));

  return devices.map((d) => {
    // Encode as a child only when the parent carrier actually resolves in this
    // same array AND a slot is set. An orphaned child (dangling container_id,
    // or parent in another rack) falls back to a rack-level encoding so its
    // human-U position is preserved instead of leaking a raw 0-index.
    const parentIndex =
      d.container_id !== undefined ? indexById.get(d.container_id) : undefined;
    const isChild = parentIndex !== undefined && d.slot_id !== undefined;
    return {
      t: d.device_type,
      // Children use their raw 0-indexed slot position; rack-level devices use
      // human-U for readability.
      p: isChild ? d.position : toHumanUnits(d.position),
      f: d.face,
      ...(d.name ? { n: d.name } : {}),
      ...(isChild ? { ci: parentIndex } : {}),
      ...(isChild ? { si: d.slot_id } : {}),
      ...(d.auto_created ? { a: 1 as const } : {}),
    };
  });
}

/**
 * Convert minimal device types back to full DeviceType[]. Container types carry
 * their slot grid / slot_width / subdevice_role so their children resolve to
 * real slots after a round trip.
 */
function convertDeviceTypes(dt: MinimalDeviceType[]): DeviceType[] {
  return dt.map((item) => ({
    slug: item.s,
    u_height: item.h,
    ...(item.mf ? { manufacturer: item.mf } : {}),
    ...(item.m ? { model: item.m } : {}),
    colour: item.c,
    category: ABBREV_TO_CATEGORY[item.x] ?? "other",
    ...(item.sl
      ? {
          slots: item.sl.map((s) => ({
            id: s.id,
            position: { row: s.r, col: s.cl },
            ...(s.wf !== undefined ? { width_fraction: s.wf } : {}),
            ...(s.hu !== undefined ? { height_units: s.hu } : {}),
          })),
        }
      : {}),
    ...(item.sw !== undefined ? { slot_width: item.sw } : {}),
    ...(item.sr ? { subdevice_role: item.sr } : {}),
  }));
}

/**
 * Convert minimal devices back to full PlacedDevice[].
 *
 * Container children (`ci` set) get a fresh container_id resolved from the
 * parent carrier's index, their slot_id from `si`, and a raw 0-indexed
 * position. A `ci` pointing outside the array, or at a non-carrier, is dropped
 * to a bare rack-level placement rather than trusted (untrusted share input).
 */
function convertMinimalDevices(devices: MinimalDevice[]): PlacedDevice[] {
  // Pre-generate an id per index so children can resolve their parent before
  // the parent itself is converted (order-independent).
  const idByIndex = devices.map(() => generateId());

  return devices.map((d, index) => {
    const base: PlacedDevice = {
      id: idByIndex[index]!,
      device_type: d.t,
      position: 0,
      face: d.f,
    };
    if (d.n) base.name = d.n;
    if (d.a) base.auto_created = true;

    // Trust a parent reference only when it points at a real, in-range
    // container device that is not itself a child. This preserves any container
    // (user-placed shelf/chassis as well as synthesized carriers) while
    // rejecting untrusted input that attaches a child to another child.
    const parent =
      d.ci !== undefined && d.ci >= 0 && d.ci < devices.length && d.ci !== index
        ? devices[d.ci]
        : undefined;
    const hasValidParent =
      parent !== undefined && d.si !== undefined && parent.ci === undefined;

    if (hasValidParent) {
      // Child: raw 0-indexed slot position, container/slot references.
      base.position = d.p;
      base.container_id = idByIndex[d.ci!]!;
      base.slot_id = d.si;
    } else {
      // Rack-level: human-U -> internal units.
      base.position = toInternalUnits(d.p);
    }
    return base;
  });
}

// =============================================================================
// Layout Conversion Functions
// =============================================================================

/**
 * Convert Layout to MinimalLayoutV2 (multi-rack)
 * Always encodes as v2 format, even for single-rack layouts.
 * Only includes device types that are actually placed in racks.
 */
export function toMinimalLayout(layout: Layout): MinimalLayoutV2 {
  if (layout.racks.length === 0) {
    throw new Error("Layout must have at least one rack");
  }

  // Build rack ID map: real UUID -> short sequential ID
  const rackIdMap = new Map<string, string>();
  layout.racks.forEach((rack, index) => {
    rackIdMap.set(rack.id, String(index));
  });

  // Collect used device type slugs from ALL racks (deduplicated)
  const usedSlugs = new Set<string>();
  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      usedSlugs.add(device.device_type);
    }
  }

  // Validate all used slugs exist in device_types
  const availableSlugs = new Set(layout.device_types.map((t) => t.slug));
  const missingSlugs = [...usedSlugs].filter((s) => !availableSlugs.has(s));
  if (missingSlugs.length > 0) {
    throw new Error(
      `Cannot share layout: missing device types: ${missingSlugs.join(", ")}`,
    );
  }

  // Filter and convert device types (only used ones, deduplicated by slug)
  const dt: MinimalDeviceType[] = layout.device_types
    .filter((deviceType) => usedSlugs.has(deviceType.slug))
    .map((deviceType) => ({
      s: deviceType.slug,
      h: deviceType.u_height,
      ...(deviceType.manufacturer ? { mf: deviceType.manufacturer } : {}),
      ...(deviceType.model ? { m: deviceType.model } : {}),
      c: deviceType.colour,
      x: CATEGORY_TO_ABBREV[deviceType.category] ?? "o",
      // Container types carry their slot grid so children round-trip to real
      // slots (a child references slot_id, which must exist on the parent type).
      ...(deviceType.slots && deviceType.slots.length > 0
        ? {
            sl: deviceType.slots.map((s) => ({
              id: s.id,
              r: s.position.row,
              cl: s.position.col,
              ...(s.width_fraction !== undefined
                ? { wf: s.width_fraction }
                : {}),
              ...(s.height_units !== undefined ? { hu: s.height_units } : {}),
            })),
          }
        : {}),
      ...(deviceType.slot_width !== undefined
        ? { sw: deviceType.slot_width }
        : {}),
      ...(deviceType.subdevice_role ? { sr: deviceType.subdevice_role } : {}),
    }));

  // Convert all racks to MinimalRackV2
  const rs: MinimalRackV2[] = layout.racks.map((rack) => ({
    i: rackIdMap.get(rack.id)!,
    n: rack.name,
    h: rack.height,
    w: normalizeRackWidth(rack.width),
    d: convertDevices(rack.devices),
  }));

  // Convert rack groups (if present)
  const rg: MinimalRackGroup[] | undefined =
    layout.rack_groups && layout.rack_groups.length > 0
      ? layout.rack_groups.map((group, groupIndex) => {
          const missingIds = group.rack_ids.filter((id) => !rackIdMap.has(id));
          if (missingIds.length > 0) {
            console.warn(
              `Share encode: rack group ${group.name ?? `#${groupIndex}`} references unknown rack IDs: ${missingIds.join(", ")}`,
            );
          }
          return {
            rs: group.rack_ids
              .map((id) => rackIdMap.get(id))
              .filter((id): id is string => id !== undefined),
            ...(group.name ? { n: group.name } : {}),
            ...(group.layout_preset ? { p: group.layout_preset } : {}),
          };
        })
      : undefined;

  return {
    v: layout.version,
    fv: SHARE_FORMAT_VERSION,
    n: layout.name,
    rs,
    ...(rg ? { rg } : {}),
    dt,
  };
}

/**
 * Convert v1 MinimalLayout (single rack) back to full Layout
 */
function fromMinimalLayoutV1(minimal: MinimalLayout): Layout {
  const device_types = convertDeviceTypes(minimal.dt);
  const devices = convertMinimalDevices(minimal.r.d);

  const rack = createDefaultRack(
    minimal.r.n,
    minimal.r.h,
    normalizeRackWidth(minimal.r.w),
    "4-post-cabinet",
    false,
    1,
    true,
    generateId(),
  );
  rack.devices = devices;

  return {
    version: minimal.v,
    name: minimal.n,
    racks: [rack],
    device_types,
    settings: {
      display_mode: "label",
      show_labels_on_images: false,
    },
  };
}

/**
 * Convert v2 MinimalLayoutV2 (multi-rack) back to full Layout
 */
function fromMinimalLayoutV2(minimal: MinimalLayoutV2): Layout {
  const device_types = convertDeviceTypes(minimal.dt);

  // Build reverse map: shortId -> generated UUID
  const shortIdToUuid = new Map<string, string>();

  const racks = minimal.rs.map((minRack) => {
    const rackId = generateId();
    shortIdToUuid.set(minRack.i, rackId);

    const rack = createDefaultRack(
      minRack.n,
      minRack.h,
      normalizeRackWidth(minRack.w),
      "4-post-cabinet",
      false,
      1,
      true,
      rackId,
    );
    rack.devices = convertMinimalDevices(minRack.d);
    return rack;
  });

  // Convert rack groups (translate short IDs back to UUIDs)
  const rack_groups: RackGroup[] | undefined =
    minimal.rg && minimal.rg.length > 0
      ? minimal.rg.map((group, groupIndex) => {
          const unknownIds = group.rs.filter(
            (shortId) => !shortIdToUuid.has(shortId),
          );
          if (unknownIds.length > 0) {
            console.warn(
              `Share decode: rack group ${group.n ?? `#${groupIndex}`} references unknown short IDs: ${unknownIds.join(", ")}`,
            );
          }
          return {
            id: generateId(),
            rack_ids: group.rs
              .map((shortId) => shortIdToUuid.get(shortId))
              .filter((id): id is string => id !== undefined),
            ...(group.n ? { name: group.n } : {}),
            ...(group.p ? { layout_preset: group.p } : {}),
          };
        })
      : undefined;

  return {
    version: minimal.v,
    name: minimal.n,
    racks,
    ...(rack_groups ? { rack_groups } : {}),
    device_types,
    settings: {
      display_mode: "label",
      show_labels_on_images: false,
    },
  };
}

/**
 * Convert MinimalLayout back to full Layout
 * Public wrapper kept for backward compatibility with existing callers
 */
export function fromMinimalLayout(
  minimal: MinimalLayout | MinimalLayoutV2,
): Layout {
  if ("rs" in minimal) {
    return fromMinimalLayoutV2(minimal as MinimalLayoutV2);
  }
  return fromMinimalLayoutV1(minimal as MinimalLayout);
}

// =============================================================================
// Encoding/Decoding Functions
// =============================================================================

/**
 * Base64url encode (URL-safe base64)
 */
export function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64url decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Encode Layout to URL-safe compressed string
 * Always encodes as v2 format.
 * Returns null if encoding fails (e.g., empty racks, missing device types)
 */
export function encodeLayout(layout: Layout): string | null {
  try {
    const minimal = toMinimalLayout(layout);
    const json = JSON.stringify(minimal);
    return LZString.compressToEncodedURIComponent(json);
  } catch (error) {
    console.warn("Share link encode failed:", error);
    return null;
  }
}

export interface DecodeResult {
  layout: Layout | null;
  error?: string;
}

/**
 * Decode URL-safe compressed string to Layout
 * Supports both v1 (single rack) and v2 (multi-rack) formats.
 * Detects version by field presence: `r` = v1, `rs` = v2.
 * Returns DecodeResult with layout and optional error context.
 */
export function decodeLayout(encoded: string): DecodeResult {
  try {
    // Try lz-string first (new format); returns null for legacy pako-encoded URLs
    let json = LZString.decompressFromEncodedURIComponent(encoded);

    if (!json) {
      // Fall back to pako for URLs encoded before the lz-string migration
      const compressed = base64UrlDecode(encoded);
      json = pako.inflate(compressed, { to: "string" });
    }
    const parsed = JSON.parse(json);

    // Detect v1 vs v2 by field presence
    if ("rs" in parsed) {
      const result = MinimalLayoutV2Schema.safeParse(parsed);
      if (!result.success) {
        console.warn("Share link v2 validation failed:", result.error);
        return { layout: null, error: "Layout format is invalid or outdated" };
      }
      return { layout: fromMinimalLayoutV2(result.data) };
    }

    // v1 fallback
    const result = MinimalLayoutSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Share link v1 validation failed:", result.error);
      return { layout: null, error: "Layout format is invalid or outdated" };
    }
    return { layout: fromMinimalLayoutV1(result.data) };
  } catch (error) {
    console.warn("Share link decode failed:", error);
    return { layout: null, error: "Could not decode share link" };
  }
}

// =============================================================================
// URL Helper Functions
// =============================================================================

/**
 * Generate full share URL for a layout
 * Returns null if encoding fails
 */
export function generateShareUrl(layout: Layout): string | null {
  const encoded = encodeLayout(layout);
  if (!encoded) return null;

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "https://app.racku.la/";
  return `${baseUrl}?l=${encoded}`;
}

/**
 * Get share parameter from current URL
 * Returns null if not present
 */
export function getShareParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("l");
}

/**
 * Clear share parameter from URL without reload
 * Uses history.replaceState to update URL cleanly
 */
export function clearShareParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("l");
  window.history.replaceState({}, "", url.toString());
}
