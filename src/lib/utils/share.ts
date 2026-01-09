/**
 * Share URL Encoding/Decoding
 * Converts Layout <-> MinimalLayout <-> compressed base64url string
 */

import pako from "pako";
import type { Layout, DeviceType, PlacedDevice } from "$lib/types";
import {
  MinimalLayoutSchema,
  CATEGORY_TO_ABBREV,
  ABBREV_TO_CATEGORY,
  type MinimalLayout,
  type MinimalDeviceType,
  type MinimalDevice,
} from "$lib/schemas/share";
import { generateId } from "./device";

// =============================================================================
// Layout Conversion Functions
// =============================================================================

/**
 * Convert Layout to MinimalLayout
 * Only includes device types that are actually placed in the rack
 * Note: Multi-rack layouts use the first rack for sharing
 */
export function toMinimalLayout(layout: Layout): MinimalLayout {
  // For multi-rack layouts, use the first rack
  const rack = layout.racks[0];
  if (!rack) {
    throw new Error("Layout must have at least one rack");
  }

  // Get unique device type slugs from placed devices
  const usedSlugs = new Set(rack.devices.map((d) => d.device_type));

  // Filter and convert device types (only used ones)
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

  // Convert devices
  const devices: MinimalDevice[] = rack.devices.map((d) => ({
    t: d.device_type,
    p: d.position,
    f: d.face,
    ...(d.name ? { n: d.name } : {}),
  }));

  return {
    v: layout.version,
    n: layout.name,
    r: {
      n: rack.name,
      h: rack.height,
      w: rack.width,
      d: devices,
    },
    dt,
  };
}

/**
 * Convert MinimalLayout back to full Layout
 * Generates IDs for devices, adds default settings
 */
export function fromMinimalLayout(minimal: MinimalLayout): Layout {
  // Convert device types
  const device_types: DeviceType[] = minimal.dt.map((dt) => ({
    slug: dt.s,
    u_height: dt.h,
    ...(dt.mf ? { manufacturer: dt.mf } : {}),
    ...(dt.m ? { model: dt.m } : {}),
    colour: dt.c,
    category: ABBREV_TO_CATEGORY[dt.x] ?? "other",
  }));

  // Convert devices with generated UUIDs
  const devices: PlacedDevice[] = minimal.r.d.map((d) => ({
    id: generateId(),
    device_type: d.t,
    position: d.p,
    face: d.f,
    ...(d.n ? { name: d.n } : {}),
  }));

  return {
    version: minimal.v,
    name: minimal.n,
    racks: [
      {
        id: generateId(),
        name: minimal.r.n,
        height: minimal.r.h,
        width: minimal.r.w,
        desc_units: false,
        form_factor: "4-post-cabinet",
        starting_unit: 1,
        position: 0,
        devices,
        view: "front",
      },
    ],
    device_types,
    settings: {
      display_mode: "label",
      show_labels_on_images: false,
    },
  };
}

// =============================================================================
// Encoding/Decoding Functions
// =============================================================================

/**
 * Base64url encode (URL-safe base64)
 */
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
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
 */
export function encodeLayout(layout: Layout): string {
  const minimal = toMinimalLayout(layout);
  const json = JSON.stringify(minimal);
  const compressed = pako.deflate(json);
  return base64UrlEncode(compressed);
}

/**
 * Decode URL-safe compressed string to Layout
 * Returns null if decoding fails (invalid format, validation error, etc.)
 */
export function decodeLayout(encoded: string): Layout | null {
  try {
    const compressed = base64UrlDecode(encoded);
    const json = pako.inflate(compressed, { to: "string" });
    const parsed = JSON.parse(json);

    // Validate with Zod
    const result = MinimalLayoutSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Share link validation failed:", result.error);
      return null;
    }

    return fromMinimalLayout(result.data);
  } catch (error) {
    console.warn("Share link decode failed:", error);
    return null;
  }
}

// =============================================================================
// URL Helper Functions
// =============================================================================

/**
 * Generate full share URL for a layout
 */
export function generateShareUrl(layout: Layout): string {
  const encoded = encodeLayout(layout);
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
