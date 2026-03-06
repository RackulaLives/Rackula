/**
 * Device Library Import Utilities
 * Validation and parsing for importing device libraries from JSON
 */

import type { DeviceType, DeviceCategory } from "$lib/types";
import { getDefaultColour } from "./device";
import { generateDeviceSlug } from "./slug";

// Valid device categories for validation
const VALID_CATEGORIES: DeviceCategory[] = [
  "server",
  "network",
  "patch-panel",
  "power",
  "storage",
  "kvm",
  "av-media",
  "cooling",
  "shelf",
  "blank",
  "other",
];

// Import validation allows broader height range than UI (0.5U-100U)
const IMPORT_MIN_HEIGHT = 0.5;
const IMPORT_MAX_HEIGHT = 100;

/**
 * Raw device data from import (before validation and ID assignment)
 */
interface RawImportDevice {
  name?: string;
  height?: number;
  category?: string;
  colour?: string;
  notes?: string;
}

/**
 * Validate a device object for import
 * More permissive than UI validation (allows 0.5U-100U)
 */
export function validateImportDevice(device: unknown): boolean {
  // Must be an object
  if (!device || typeof device !== "object") {
    return false;
  }

  const rawDevice = device as Record<string, unknown>;

  // Validate name exists and is non-empty
  if (typeof rawDevice.name !== "string" || rawDevice.name.trim() === "") {
    return false;
  }

  // Validate height is a number in valid range
  if (typeof rawDevice.height !== "number") {
    return false;
  }
  if (
    rawDevice.height < IMPORT_MIN_HEIGHT ||
    rawDevice.height > IMPORT_MAX_HEIGHT
  ) {
    return false;
  }

  // Validate category is valid
  if (typeof rawDevice.category !== "string") {
    return false;
  }
  if (!VALID_CATEGORIES.includes(rawDevice.category as DeviceCategory)) {
    return false;
  }

  return true;
}

/**
 * Result of parsing device library import
 */
export interface ParseDeviceLibraryResult {
  /** Successfully imported device types with slugs and colours assigned */
  devices: DeviceType[];
  /** Count of invalid devices that were skipped */
  skipped: number;
  /** Error message if parsing failed entirely */
  error?: string;
}

/**
 * Generate a unique slug by adding suffix if needed
 */
function generateUniqueSlug(baseName: string, existingSlugs: string[]): string {
  const baseSlug = generateDeviceSlug(undefined, undefined, baseName);

  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  // Try with -imported suffix
  const candidateSlug = `${baseSlug}-imported`;
  if (!existingSlugs.includes(candidateSlug)) {
    return candidateSlug;
  }

  // Try -imported-N for incrementing N
  let counter = 2;
  while (existingSlugs.includes(`${baseSlug}-imported-${counter}`)) {
    counter++;
  }

  return `${baseSlug}-imported-${counter}`;
}

/**
 * Parse and validate device library import from JSON
 * Assigns slugs and colours to imported device types
 * Renames duplicates with -imported suffix
 */
export function parseDeviceLibraryImport(
  json: string,
  existingSlugs: string[] = [],
): ParseDeviceLibraryResult {
  let data: unknown;

  // Parse JSON
  try {
    data = JSON.parse(json);
  } catch (e) {
    console.warn("[Rackula] Failed to parse device library JSON:", e);
    return { devices: [], skipped: 0, error: "Invalid JSON format" };
  }

  // Check for devices array
  if (
    !data ||
    typeof data !== "object" ||
    !("devices" in data) ||
    !Array.isArray(data.devices)
  ) {
    return {
      devices: [],
      skipped: 0,
      error: "Invalid format — expected { devices: [...] }",
    };
  }

  const devices: DeviceType[] = [];
  let skipped = 0;
  const allSlugs = [...existingSlugs];

  for (const rawDevice of data.devices as RawImportDevice[]) {
    // Validate device
    if (!validateImportDevice(rawDevice)) {
      skipped++;
      continue;
    }

    // Generate unique slug if duplicate
    const uniqueSlug = generateUniqueSlug(rawDevice.name!, allSlugs);
    allSlugs.push(uniqueSlug);

    // Create device type with assigned slug and colour
    const deviceType: DeviceType = {
      slug: uniqueSlug,
      u_height: rawDevice.height!,
      model: rawDevice.name,
      colour:
        rawDevice.colour ??
        getDefaultColour(rawDevice.category as DeviceCategory),
      category: rawDevice.category as DeviceCategory,
    };

    if (rawDevice.notes) {
      deviceType.notes = rawDevice.notes;
    }

    devices.push(deviceType);
  }

  return { devices, skipped };
}
