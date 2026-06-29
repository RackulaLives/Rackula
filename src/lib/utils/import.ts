/**
 * Device Library Import Utilities
 * Validation and parsing for importing device libraries from JSON
 */

import type { DeviceType, DeviceCategory } from "$lib/types";
import { DeviceTypeSchema } from "$lib/schemas";
import { getDefaultColour } from "./device";
import { generateDeviceSlug } from "./slug";

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
 * Build the candidate DeviceType for a raw import row.
 *
 * Both the validation gate and the importer construct the device through this
 * helper so import ingress can never drift from what is actually stored: the
 * exact object validated by validateImportDevice is the one parseDeviceLibraryImport
 * pushes into the library.
 */
function buildImportDeviceType(
  rawDevice: RawImportDevice,
  slug: string,
): DeviceType {
  const category = rawDevice.category as DeviceCategory;

  const deviceType: DeviceType = {
    slug,
    u_height: rawDevice.height as number,
    model: rawDevice.name,
    colour: rawDevice.colour ?? getDefaultColour(category),
    category,
  };

  if (rawDevice.notes) {
    deviceType.notes = rawDevice.notes;
  }

  return deviceType;
}

/**
 * Validate a device object for import.
 *
 * Routes ingress through DeviceTypeSchema (the canonical device contract) rather
 * than hand-rolled name/height/category checks, so a payload the schema rejects
 * (malformed colour, out-of-range or non-half-U height, out-of-enum category)
 * cannot enter the library. The candidate is built with a placeholder slug
 * because the real slug is assigned later by generateUniqueSlug and always
 * conforms to SLUG_PATTERN.
 */
export function validateImportDevice(device: unknown): boolean {
  // Must be an object
  if (!device || typeof device !== "object") {
    return false;
  }

  const rawDevice = device as RawImportDevice;

  // Name maps to the device model and supplies the slug source. Guard it here so
  // a missing or blank name fails cleanly instead of building an unnamed device.
  if (typeof rawDevice.name !== "string" || rawDevice.name.trim() === "") {
    return false;
  }

  const candidate = buildImportDeviceType(rawDevice, "import-candidate");
  return DeviceTypeSchema.safeParse(candidate).success;
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

    // Create device type with assigned slug and colour using the same builder the
    // validation gate ran against.
    const deviceType = buildImportDeviceType(rawDevice, uniqueSlug);

    // Re-validate the final object against the schema with its real generated
    // slug. The per-row gate above runs against a placeholder slug, so a name
    // that slugifies to an empty or otherwise invalid slug (for example a
    // punctuation-only name) would pass the gate but be stored schema-invalid and
    // later break autosave/load. Skip it so only schema-valid devices are stored.
    if (!DeviceTypeSchema.safeParse(deviceType).success) {
      skipped++;
      continue;
    }

    devices.push(deviceType);
  }

  if (devices.length === 0 && skipped > 0) {
    return { devices: [], skipped, error: "No valid devices found in file" };
  }

  return { devices, skipped };
}
