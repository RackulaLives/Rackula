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
 */

import pako from "pako";
import type {
  Layout,
  DeviceType,
  PlacedDevice,
  RackGroup,
} from "$lib/types";
import {
  MinimalLayoutSchema,
  MinimalLayoutV2Schema,
  CATEGORY_TO_ABBREV,
  ABBREV_TO_CATEGORY,
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
 * Convert a rack's devices to minimal format
 */
function convertDevices(devices: PlacedDevice[]): MinimalDevice[] {
  return devices.map((d) => ({
    t: d.device_type,
    p: toHumanUnits(d.position),
    f: d.face,
    ...(d.name ? { n: d.name } : {}),
  }));
}

/**
 * Convert minimal device types back to full DeviceType[]
 */
function convertDeviceTypes(dt: MinimalDeviceType[]): DeviceType[] {
  return dt.map((item) => ({
    slug: item.s,
    u_height: item.h,
    ...(item.mf ? { manufacturer: item.mf } : {}),
    ...(item.m ? { model: item.m } : {}),
    colour: item.c,
    category: ABBREV_TO_CATEGORY[item.x] ?? "other",
  }));
}

/**
 * Convert minimal devices back to full PlacedDevice[]
 */
function convertMinimalDevices(devices: MinimalDevice[]): PlacedDevice[] {
  return devices.map((d) => ({
    id: generateId(),
    device_type: d.t,
    position: toInternalUnits(d.p),
    face: d.f,
    ...(d.n ? { name: d.n } : {}),
  }));
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
          const missingIds = group.rack_ids.filter(
            (id) => !rackIdMap.has(id),
          );
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
    const compressed = pako.deflate(json);
    return base64UrlEncode(compressed);
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
    const compressed = base64UrlDecode(encoded);
    const json = pako.inflate(compressed, { to: "string" });
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
