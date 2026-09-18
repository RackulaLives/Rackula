/**
 * Rack Utility Functions
 * Pure functions for rack operations
 */

import { nanoid } from "nanoid";
import type { DeviceType, FormFactor, Rack, RackView } from "$lib/types";
import {
  MIN_RACK_HEIGHT,
  MAX_RACK_HEIGHT,
  STANDARD_RACK_WIDTH,
  ALLOWED_RACK_WIDTHS,
  DEFAULT_RACK_VIEW,
} from "$lib/types/constants";
import { wrapText } from "$lib/utils/text-sizing";

/** Font size of the empty-rack hint, used both to render and to wrap it */
export const EMPTY_RACK_HINT_FONT_SIZE = 11;

/** Distance between the centres of consecutive empty-rack hint lines */
export const EMPTY_RACK_HINT_LINE_HEIGHT = EMPTY_RACK_HINT_FONT_SIZE * 1.4;

/** Breathing room between the hint text and the rails or top and bottom bars */
const EMPTY_RACK_HINT_INSET = 4;

export interface EmptyRackHintOptions {
  face: "front" | "rear";
  /** Whether the rack holds any device on either face */
  rackHasDevices: boolean;
  /** Whether this face renders any device */
  faceHasDevices: boolean;
  /** Width between the rails, in pixels */
  interiorWidth: number;
  /** Height between the top and bottom bars, in pixels */
  interiorHeight: number;
}

/**
 * Lines of the empty-state hint for one face of a face-filtered rack (#3330).
 * A fully empty rack gets a single hint on the front face only, so dual view
 * does not repeat it per face. A face that is empty while the other face has
 * devices gets its own short hint. Each phrase starts a new line and is
 * wrapped to the rack interior, since SVG text does not wrap. The hint is
 * omitted when the wrapped block is taller than the interior (very short
 * racks), rather than spilling onto the rails.
 *
 * @returns The wrapped lines, empty when this face shows no hint
 */
export function getEmptyRackHintLines({
  face,
  rackHasDevices,
  faceHasDevices,
  interiorWidth,
  interiorHeight,
}: EmptyRackHintOptions): string[] {
  if (faceHasDevices) return [];
  let phrases: string[];
  if (!rackHasDevices) {
    if (face !== "front") return [];
    phrases = ["Empty rack.", "Drag a device in."];
  } else {
    phrases = [face === "front" ? "Front is empty." : "Rear is empty."];
  }
  const width = interiorWidth - EMPTY_RACK_HINT_INSET * 2;
  const lines = phrases.flatMap((phrase) =>
    wrapText(phrase, width, EMPTY_RACK_HINT_FONT_SIZE),
  );
  const blockHeight =
    (lines.length - 1) * EMPTY_RACK_HINT_LINE_HEIGHT +
    EMPTY_RACK_HINT_FONT_SIZE;
  return blockHeight + EMPTY_RACK_HINT_INSET * 2 <= interiorHeight ? lines : [];
}

/**
 * Generate a unique rack ID using nanoid (21 characters)
 * Used for multi-rack support - stable identifier that survives renames
 */
export function generateRackId(): string {
  return nanoid();
}

/**
 * Generate a unique rack group ID using nanoid (21 characters)
 * Used for rack group management - stable identifier that survives renames
 */
export function generateGroupId(): string {
  return nanoid();
}

/**
 * Create a new rack with sensible defaults
 * Generates a unique ID using nanoid
 */
export function createRack(
  name: string,
  height: number,
  view?: RackView,
  width?: 10 | 19,
  form_factor?: FormFactor,
  desc_units?: boolean,
  starting_unit?: number,
  show_rear?: boolean,
): Rack {
  return {
    id: generateRackId(),
    name,
    height,
    width: width ?? (STANDARD_RACK_WIDTH as 10 | 19),
    position: 0,
    view: view ?? DEFAULT_RACK_VIEW,
    devices: [],
    form_factor: form_factor ?? "4-post-cabinet",
    desc_units: desc_units ?? false,
    show_rear: show_rear ?? true,
    starting_unit: starting_unit ?? 1,
  };
}

/**
 * Validation result for a rack
 */
export interface RackValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a rack object
 */
export function validateRack(rack: Rack): RackValidationResult {
  const errors: string[] = [];

  // Validate name
  if (!rack.name || rack.name.trim() === "") {
    errors.push("Name is required");
  }

  // Validate height
  if (rack.height < MIN_RACK_HEIGHT || rack.height > MAX_RACK_HEIGHT) {
    errors.push(
      `Height must be between ${MIN_RACK_HEIGHT} and ${MAX_RACK_HEIGHT}`,
    );
  }

  // Validate width (must be 10, 19, 21, or 23 inches)
  if (!ALLOWED_RACK_WIDTHS.includes(rack.width)) {
    errors.push("Width must be 10, 19, 21, or 23 inches");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get all U positions occupied by devices in a rack
 * @param rack - The rack to check
 * @param deviceLibrary - The device library to look up device heights
 * @returns Set of occupied U positions
 */
export function getOccupiedUs(
  rack: Rack,
  deviceLibrary: DeviceType[],
): Set<number> {
  const occupied = new Set<number>();

  for (const placedDevice of rack.devices) {
    const device = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (device) {
      // Device at position P with height H occupies Us P through P+H-1
      for (
        let u = placedDevice.position;
        u < placedDevice.position + device.u_height;
        u++
      ) {
        occupied.add(u);
      }
    }
  }

  return occupied;
}

/**
 * Check if a specific U position is available in a rack
 * @param rack - The rack to check
 * @param deviceLibrary - The device library to look up device heights
 * @param uPosition - The U position to check
 * @returns true if the position is available, false if occupied
 */
export function isUAvailable(
  rack: Rack,
  deviceLibrary: DeviceType[],
  uPosition: number,
): boolean {
  const occupied = getOccupiedUs(rack, deviceLibrary);
  return !occupied.has(uPosition);
}

/**
 * Create a deep copy of a rack
 * @param rack - The rack to duplicate
 * @returns A new rack with copied name and copied devices
 */
export function duplicateRack(rack: Rack): Rack {
  return {
    ...rack,
    name: `${rack.name} (Copy)`,
    position: rack.position + 1,
    devices: rack.devices.map((device) => ({ ...device })),
  };
}
