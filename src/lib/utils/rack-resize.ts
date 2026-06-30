/**
 * Rack Resize Validation
 *
 * Utilities for validating rack height changes with devices in place.
 * Issue #115: Allow growing always, shrinking only when devices fit.
 */

import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { toHumanUnits } from "./position";
import { MIN_RACK_HEIGHT } from "$lib/types/constants";

/**
 * Result of resize validation
 */
export interface ResizeValidationResult {
  /** Whether the resize is allowed */
  allowed: boolean;
  /** List of devices that would exceed new bounds */
  conflicts: PlacedDevice[];
}

/**
 * Conflict with enriched device type information
 */
export interface ConflictInfo {
  device: PlacedDevice;
  deviceType: DeviceType | undefined;
}

/**
 * Highest whole-U a placed device occupies (its top edge). Converts the stored
 * internal position to human U and rounds a fractional top up. Shared by the
 * shrink guard and the resize floor so they cannot drift (#1683, #2737).
 */
function getDeviceOccupiedTopU(
  device: PlacedDevice,
  deviceTypes: DeviceType[],
): number {
  const deviceType = deviceTypes.find((dt) => dt.slug === device.device_type);
  const uHeight = deviceType?.u_height ?? 1; // Default to 1U if unknown
  return Math.ceil(toHumanUnits(device.position) + uHeight - 1);
}

/**
 * Check if a rack can be resized to a new height
 *
 * Rules:
 * - Growing is always allowed
 * - Shrinking is blocked if any device's top position exceeds new height
 * - Conflict formula: position + u_height - 1 > newHeight
 *
 * @param rack - The rack to check
 * @param newHeight - The proposed new height (human U)
 * @param deviceTypes - Device type library for u_height lookup
 * @returns Validation result with conflicts if any
 */
export function canResizeRackTo(
  rack: Rack,
  newHeight: number,
  deviceTypes: DeviceType[],
): ResizeValidationResult {
  // Growing is always allowed
  if (newHeight >= rack.height) {
    return { allowed: true, conflicts: [] };
  }

  // Shrinking - check each device
  const conflicts: PlacedDevice[] = [];

  for (const device of rack.devices) {
    if (getDeviceOccupiedTopU(device, deviceTypes) > newHeight) {
      conflicts.push(device);
    }
  }

  return {
    allowed: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Lowest height (whole U) a rack can shrink to without clipping a placed
 * device. Equals the highest occupied U across all devices, or MIN_RACK_HEIGHT
 * for an empty rack. The canvas drag-resize clamps to this so a shrink can
 * never drop below the topmost device, the same floor canResizeRackTo enforces.
 */
export function getMinResizeHeight(
  rack: Rack,
  deviceTypes: DeviceType[],
): number {
  let highest = MIN_RACK_HEIGHT;
  for (const device of rack.devices) {
    const top = getDeviceOccupiedTopU(device, deviceTypes);
    if (top > highest) highest = top;
  }
  return highest;
}

/**
 * Inputs for snapResizeHeight.
 */
export interface SnapResizeParams {
  /** Rack height (whole U) when the drag began. */
  startHeight: number;
  /** Signed pixels dragged toward growth; positive grows the rack. */
  growPx: number;
  /** On-screen pixels per U: the rendered U height times the canvas zoom. */
  pxPerU: number;
  /** Lowest allowed height, from getMinResizeHeight. */
  minHeight: number;
  /** Highest allowed height (schema max). */
  maxHeight: number;
}

/**
 * Snap a pointer drag to a whole-U rack height.
 *
 * Rounds the drag distance to the nearest whole U so the rail invariant holds
 * (positions stay on whole-U boundaries), then clamps to [minHeight, maxHeight].
 * A non-positive pxPerU (a degenerate zoom) holds the start height rather than
 * dividing by zero.
 */
export function snapResizeHeight({
  startHeight,
  growPx,
  pxPerU,
  minHeight,
  maxHeight,
}: SnapResizeParams): number {
  if (pxPerU <= 0) return startHeight;
  const deltaU = Math.round(growPx / pxPerU);
  const raw = startHeight + deltaU;
  return Math.max(minHeight, Math.min(maxHeight, raw));
}

/**
 * Get human-readable U range text for a device
 *
 * @example
 * getDeviceRangeText(device, { u_height: 1 }) // "U15"
 * getDeviceRangeText(device, { u_height: 3 }) // "U10-12"
 */
export function getDeviceRangeText(
  device: PlacedDevice,
  deviceType: DeviceType | undefined,
): string {
  const uHeight = deviceType?.u_height ?? 1;
  // Convert internal units to human U for display (#1683).
  const bottom = toHumanUnits(device.position);
  const top = Math.ceil(bottom + uHeight - 1);

  if (top === bottom) {
    return `U${bottom}`;
  }
  return `U${bottom}-${top}`;
}

/**
 * Get detailed conflict information with device types
 */
export function getConflictDetails(
  conflicts: PlacedDevice[],
  deviceTypes: DeviceType[],
): ConflictInfo[] {
  return conflicts.map((device) => ({
    device,
    deviceType: deviceTypes.find((dt) => dt.slug === device.device_type),
  }));
}

/**
 * Format conflict list into user-friendly message
 *
 * @example
 * formatConflictMessage(conflicts) // "Switch at U40, Storage at U38-40"
 */
export function formatConflictMessage(conflicts: ConflictInfo[]): string {
  return conflicts
    .map(({ device, deviceType }) => {
      const name =
        device.name ?? deviceType?.model ?? deviceType?.slug ?? "Device";
      const range = getDeviceRangeText(device, deviceType);
      return `${name} at ${range}`;
    })
    .join(", ");
}
