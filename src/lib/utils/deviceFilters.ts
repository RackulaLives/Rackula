/**
 * Device Filters
 * Utility functions for searching and grouping devices
 */

import Fuse from "fuse.js";
import type { IFuseOptions } from "fuse.js";
import type { DeviceType, DeviceCategory } from "$lib/types";
import { DeviceCategorySchema } from "$lib/schemas";

const DEFAULT_RACK_WIDTHS = [19];

/**
 * Display order for device categories in the palette.
 * Ordered by typical usage frequency: common equipment first (servers, network),
 * utility/structural items last (blanks, cable management, other).
 * Every DeviceCategory value MUST appear here; a dev-only assertion
 * enforces this so new categories cannot be silently dropped.
 */
export const categoryOrder: DeviceCategory[] = [
  "server",
  "network",
  "firewall",
  "patch-panel",
  "power",
  "storage",
  "kvm",
  "av-media",
  "cooling",
  "shelf",
  "blank",
  "cable-management",
  "chassis",
  "other",
];

if (import.meta.env.DEV) {
  const missing = DeviceCategorySchema.options.filter(
    (cat) => !categoryOrder.includes(cat),
  );
  if (missing.length > 0) {
    throw new Error(
      `categoryOrder is missing categories: ${missing.join(", ")}. ` +
        "Add them to categoryOrder in deviceFilters.ts.",
    );
  }
  const extra = categoryOrder.filter(
    (cat) => !DeviceCategorySchema.options.includes(cat),
  );
  if (extra.length > 0) {
    throw new Error(
      `categoryOrder has unknown categories: ${extra.join(", ")}. ` +
        "Remove them from categoryOrder in deviceFilters.ts.",
    );
  }
  const unique = new Set(categoryOrder);
  if (unique.size !== categoryOrder.length) {
    const duplicates = categoryOrder.filter(
      (cat, i) => categoryOrder.indexOf(cat) !== i,
    );
    throw new Error(
      `categoryOrder has duplicate entries: ${duplicates.join(", ")}.`,
    );
  }
}

/**
 * Fuse.js configuration for fuzzy search.
 * Threshold of 0.3 balances typo tolerance with precision.
 * Lower = stricter matching, higher = more lenient.
 */
const fuseOptions: IFuseOptions<DeviceType> = {
  keys: [
    { name: "model", weight: 3 },
    { name: "manufacturer", weight: 2 },
    { name: "slug", weight: 1 },
    { name: "category", weight: 1 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
};

/**
 * Check if a device matches a single search token (fuzzy match against any searchable field).
 * Returns true if the token fuzzy-matches the model, manufacturer, slug, or category.
 */
function deviceMatchesToken(device: DeviceType, token: string): boolean {
  const fuse = new Fuse([device], {
    ...fuseOptions,
    // Use same threshold as main search for consistent behavior
  });
  return fuse.search(token).length > 0;
}

/**
 * Search device types using Fuse.js fuzzy search with multi-word AND support.
 *
 * Features:
 * - Fuzzy matching for typos (e.g., "Deli" → "Dell", "Ubiqiti" → "Ubiquiti")
 * - Multi-word AND queries (e.g., "MikroTik RB" returns only MikroTik RB* devices)
 * - Results ranked by relevance: model matches > manufacturer > slug > category
 *
 * Multi-word behavior:
 * - Single word: fuzzy search across all fields
 * - Multiple words (space-separated): ALL words must match (AND logic)
 *   Each word can match any field independently, enabling cross-field queries
 *   like "MikroTik CRS" where "MikroTik" matches manufacturer and "CRS" matches model
 *
 * @param devices - Array of device types to search
 * @param query - Search query string
 * @returns Filtered array of device types matching the query, sorted by relevance score
 */
export function searchDevices(
  devices: DeviceType[],
  query: string,
): DeviceType[] {
  if (!query.trim()) {
    return devices;
  }

  const trimmedQuery = query.trim();
  const tokens = trimmedQuery.split(/\s+/).filter((t) => t.length > 0);

  // Single token: use standard Fuse.js search
  const [firstToken] = tokens;
  if (tokens.length === 1 && firstToken !== undefined) {
    const fuse = new Fuse(devices, fuseOptions);
    const results = fuse.search(firstToken);
    return results.map((r) => r.item);
  }

  // Multi-token: filter devices that match ALL tokens (AND logic)
  // Each token can match any field independently
  const matchingDevices = devices.filter((device) =>
    tokens.every((token) => deviceMatchesToken(device, token)),
  );

  // Score and sort the matching devices by running a combined query
  // Use the full query for scoring to get proper relevance ranking
  if (matchingDevices.length === 0) {
    return [];
  }

  const fuse = new Fuse(matchingDevices, fuseOptions);
  // Search with full query to get proper relevance ranking
  const results = fuse.search(trimmedQuery);

  // If we got results from scoring, use them; otherwise return unranked matches
  if (results.length > 0) {
    return results.map((r) => r.item);
  }

  return matchingDevices;
}

/**
 * Group device types by category
 * @param devices - Array of device types to group
 * @returns Map of category to device types in that category
 */
export function groupDevicesByCategory(
  devices: DeviceType[],
): Map<DeviceCategory, DeviceType[]> {
  const groups = new Map<DeviceCategory, DeviceType[]>();

  for (const device of devices) {
    const existing = groups.get(device.category) ?? [];
    groups.set(device.category, [...existing, device]);
  }

  return groups;
}

/**
 * Group devices by category, returning entries in the canonical `categoryOrder`
 * with devices sorted alphabetically within each category. Categories with no
 * devices are omitted. Use this for grouped device listings so both category and
 * device order stay consistent with the rest of the palette.
 *
 * @param devices - Array of device types to group
 * @returns Ordered `[category, sortedDevices]` tuples
 */
export function groupDevicesByCategoryOrdered(
  devices: DeviceType[],
): Array<[DeviceCategory, DeviceType[]]> {
  const grouped = groupDevicesByCategory(devices);

  return categoryOrder
    .filter((category) => grouped.has(category))
    .map((category): [DeviceCategory, DeviceType[]] => [
      category,
      sortDevicesAlphabetically(grouped.get(category) ?? []),
    ]);
}

/**
 * Get the first device matching a search query
 * @param devices - Array of device types to search
 * @param query - Search query string
 * @returns First matching device or null if no matches
 */
export function getFirstMatch(
  devices: DeviceType[],
  query: string,
): DeviceType | null {
  const matches = searchDevices(devices, query);
  return matches[0] ?? null;
}

/**
 * Get display name for a device category
 * @param category - Device category
 * @returns Human-readable category name
 */
export function getCategoryDisplayName(category: DeviceCategory): string {
  const names: Record<DeviceCategory, string> = {
    server: "Server",
    network: "Network",
    firewall: "Firewall",
    "patch-panel": "Patch Panel",
    power: "Power",
    storage: "Storage",
    kvm: "KVM",
    "av-media": "AV/Media",
    cooling: "Cooling",
    shelf: "Shelf",
    blank: "Blank",
    "cable-management": "Cable Management",
    chassis: "Chassis",
    other: "Other",
  };

  return names[category] ?? category;
}

/**
 * Shared comparator for device and brand display names. Numeric-aware so model
 * numbers order naturally (R650 < R660 < R6515; "Switch 2" < "Switch 10"), and
 * case/accent-insensitive via the "base" sensitivity. Pinned to the "en" locale
 * so the "A-Z" ordering is deterministic regardless of the host locale. Use this
 * everywhere device or brand lists are alphabetized so ordering stays consistent.
 */
const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

/**
 * Compare two device/brand display names with the shared numeric-aware,
 * case-insensitive rule. Returns negative, zero, or positive like `localeCompare`.
 */
export function compareNames(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

/**
 * Sort devices by manufacturer (brand) first, then by model within each brand
 * Devices without a manufacturer are sorted last, then by model
 * @param devices - Array of device types to sort
 * @returns New sorted array (does not mutate original)
 */
export function sortDevicesByBrandThenModel(
  devices: DeviceType[],
): DeviceType[] {
  return [...devices].sort((a, b) => {
    const aManufacturer = a.manufacturer ?? "";
    const bManufacturer = b.manufacturer ?? "";

    // Devices with manufacturer come before those without
    if (aManufacturer && !bManufacturer) return -1;
    if (!aManufacturer && bManufacturer) return 1;

    // Sort by manufacturer first, then by model within each brand
    const byBrand = compareNames(aManufacturer, bManufacturer);
    if (byBrand !== 0) return byBrand;

    return compareNames(a.model ?? a.slug, b.model ?? b.slug);
  });
}

/**
 * Sort devices alphabetically by model name (A-Z)
 * Falls back to slug if model is not defined
 * @param devices - Array of device types to sort
 * @returns New sorted array (does not mutate original)
 */
export function sortDevicesAlphabetically(devices: DeviceType[]): DeviceType[] {
  return [...devices].sort((a, b) =>
    compareNames(a.model ?? a.slug, b.model ?? b.slug),
  );
}

/**
 * Check if a device is compatible with a specific rack width.
 * Uses "minimum width" logic: a device fits if the rack width >= any supported device width.
 * This allows 19" devices to fit in 21" and 23" racks (which have the same mounting holes).
 *
 * Devices without `rack_widths` are assumed to be 19" compatible (standard racks).
 *
 * Examples:
 * - 10" device fits any rack (10" is smallest form factor)
 * - 19" device fits 19", 21", 23" racks
 * - 23" device only fits 23" rack (needs full width)
 *
 * @param device - The device type to check
 * @param rackWidth - The rack width in inches (any number, typically 10, 19, 21, or 23)
 * @returns True if the device is compatible with the given rack width
 */
export function isDeviceCompatibleWithRackWidth(
  device: DeviceType,
  rackWidth: number,
): boolean {
  const deviceWidths = resolveDeviceRackWidths(device);

  // Device is compatible if rack width >= any of the device's supported widths
  return deviceWidths.some((deviceWidth) => rackWidth >= deviceWidth);
}

/**
 * Filter devices by rack width compatibility.
 * Uses "minimum width" logic - see isDeviceCompatibleWithRackWidth for details.
 * Devices without `rack_widths` are assumed to be 19" compatible (standard racks).
 *
 * @param devices - Array of device types to filter
 * @param rackWidth - The rack width in inches (any number, typically 10, 19, 21, or 23)
 * @returns Filtered array of devices compatible with the given rack width
 */
export function filterDevicesByRackWidth(
  devices: DeviceType[],
  rackWidth: number,
): DeviceType[] {
  return devices.filter((device) =>
    isDeviceCompatibleWithRackWidth(device, rackWidth),
  );
}

/**
 * Filter palette devices by compatibility mode.
 * When compatibleOnly is false, returns all devices for discoverability.
 */
export function filterPaletteDevicesByRackWidth(
  devices: DeviceType[],
  rackWidth: number,
  compatibleOnly: boolean,
): DeviceType[] {
  return compatibleOnly
    ? filterDevicesByRackWidth(devices, rackWidth)
    : devices;
}

/**
 * Get a user-facing incompatibility message for palette items.
 * Returns null when device is compatible with the active rack width.
 */
export function getRackWidthIncompatibilityReason(
  device: DeviceType,
  rackWidth: number,
): string | null {
  if (isDeviceCompatibleWithRackWidth(device, rackWidth)) {
    return null;
  }

  const supportedWidths = resolveDeviceRackWidths(device);
  const minRequiredWidth = Math.min(...supportedWidths);

  return `Requires at least ${minRequiredWidth}" rack width (current: ${rackWidth}")`;
}

function resolveDeviceRackWidths(device: DeviceType): number[] {
  return device.rack_widths?.length ? device.rack_widths : DEFAULT_RACK_WIDTHS;
}

/**
 * Height bucket facets for attribute filtering.
 * `"0.5"` covers all sub-1U devices; `"1"`/`"2"`/`"3"` are exact U heights;
 * `"4plus"` covers 4U and taller.
 */
export type HeightBucket = "0.5" | "1" | "2" | "3" | "4plus";

/**
 * Attribute filter selections for the device palette.
 * An empty object (no heights, both width flags false, facets false) is a no-op.
 */
export interface DeviceAttributeFilters {
  /** Selected height buckets. OR within the group. */
  heights: Set<HeightBucket>;
  /** Keep half-width devices (`slot_width === 1`). */
  halfWidth: boolean;
  /** Keep full-width devices (`slot_width === 2` or unset). */
  fullWidth: boolean;
  /** Keep only devices with a front or rear image. */
  hasImage: boolean;
  /** Keep only custom (user-created) devices. */
  customOnly: boolean;
}

/** Whether a device's height falls into the given bucket. */
function matchesHeightBucket(uHeight: number, bucket: HeightBucket): boolean {
  switch (bucket) {
    case "0.5":
      return uHeight < 1;
    case "4plus":
      return uHeight >= 4;
    default:
      return uHeight === Number(bucket);
  }
}

/**
 * Filter devices by attribute facets: height bucket, half/full width,
 * has-image, and custom-only. Pure function; custom detection is injected
 * via `isCustom` rather than imported, so the predicate stays testable.
 *
 * Within the height group, buckets are OR'd. Width is OR'd too: selecting both
 * or neither half and full applies no width filter. Across groups the result is
 * AND'd, so a group with no active selection is skipped and empty filters return
 * the input array unchanged.
 *
 * @param devices - Devices to filter
 * @param filters - Active attribute selections
 * @param isCustom - Predicate returning true for custom (user-created) device slugs
 * @returns Filtered devices (the original array reference when no filter is active)
 */
export function filterDevicesByAttributes(
  devices: DeviceType[],
  filters: DeviceAttributeFilters,
  isCustom: (slug: string) => boolean,
): DeviceType[] {
  const filterByHeight = filters.heights.size > 0;
  // Both or neither selected means no width filtering.
  const filterByWidth = filters.halfWidth !== filters.fullWidth;

  if (
    !filterByHeight &&
    !filterByWidth &&
    !filters.hasImage &&
    !filters.customOnly
  ) {
    return devices;
  }

  return devices.filter((device) => {
    if (
      filterByHeight &&
      ![...filters.heights].some((bucket) =>
        matchesHeightBucket(device.u_height, bucket),
      )
    ) {
      return false;
    }

    if (filterByWidth) {
      const isHalf = device.slot_width === 1;
      if (filters.halfWidth !== isHalf) {
        return false;
      }
    }

    if (filters.hasImage && !(device.front_image || device.rear_image)) {
      return false;
    }

    if (filters.customOnly && !isCustom(device.slug)) {
      return false;
    }

    return true;
  });
}
