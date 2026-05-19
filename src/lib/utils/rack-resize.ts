/**
 * Rack Resize Validation
 *
 * Utilities for validating rack height changes with devices in place.
 * Issue #115: Allow growing always, shrinking only when devices fit.
 */

import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { toHumanUnits } from "./position";

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
    const deviceType = deviceTypes.find((dt) => dt.slug === device.device_type);
    const uHeight = deviceType?.u_height ?? 1; // Default to 1U if unknown

    // device.position is stored in internal units (UNITS_PER_U per U).
    // newHeight and u_height are in human U — convert before comparing,
    // otherwise we read an inflated "U228" for a device actually at U38 (#1683).
    const positionU = toHumanUnits(device.position);
    const deviceTop = positionU + uHeight - 1;
    const effectiveTop = Math.ceil(deviceTop); // Round up for fractional U

    if (effectiveTop > newHeight) {
      conflicts.push(device);
    }
  }

  return {
    allowed: conflicts.length === 0,
    conflicts,
  };
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
