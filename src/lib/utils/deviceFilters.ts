/**
 * Device Filters
 * Utility functions for searching and grouping devices
 */

import Fuse from "fuse.js";
import type { DeviceType, DeviceCategory } from "$lib/types";

/**
 * Fuse.js configuration for fuzzy search.
 * Threshold of 0.3 balances typo tolerance with precision.
 * Lower = stricter matching, higher = more lenient.
 */
const fuseOptions: Fuse.IFuseOptions<DeviceType> = {
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
  if (tokens.length === 1) {
    const fuse = new Fuse(devices, fuseOptions);
    const results = fuse.search(tokens[0]);
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
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Get display name for a device category
 * @param category - Device category
 * @returns Human-readable category name
 */
export function getCategoryDisplayName(category: DeviceCategory): string {
  const names: Record<DeviceCategory, string> = {
    server: "Servers",
    network: "Network",
    "patch-panel": "Patch Panels",
    power: "Power",
    storage: "Storage",
    kvm: "KVM",
    "av-media": "AV/Media",
    cooling: "Cooling",
    shelf: "Shelves",
    blank: "Blanks",
    "cable-management": "Cable Management",
    other: "Other",
  };

  return names[category] ?? category;
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
    const aManufacturer = a.manufacturer?.toLowerCase() ?? "";
    const bManufacturer = b.manufacturer?.toLowerCase() ?? "";

    // Devices with manufacturer come before those without
    if (aManufacturer && !bManufacturer) return -1;
    if (!aManufacturer && bManufacturer) return 1;

    // Sort by manufacturer first
    if (aManufacturer !== bManufacturer) {
      return aManufacturer.localeCompare(bManufacturer);
    }

    // Then sort by model
    const aModel = (a.model ?? a.slug).toLowerCase();
    const bModel = (b.model ?? b.slug).toLowerCase();
    return aModel.localeCompare(bModel);
  });
}

/**
 * Sort devices alphabetically by model name (A-Z)
 * Falls back to slug if model is not defined
 * @param devices - Array of device types to sort
 * @returns New sorted array (does not mutate original)
 */
export function sortDevicesAlphabetically(devices: DeviceType[]): DeviceType[] {
  return [...devices].sort((a, b) => {
    const aName = (a.model ?? a.slug).toLowerCase();
    const bName = (b.model ?? b.slug).toLowerCase();
    return aName.localeCompare(bName);
  });
}
