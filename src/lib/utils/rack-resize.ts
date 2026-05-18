/**
 * Rack Resize Validation
 *
 * Utilities for validating rack height changes with devices in place.
 * Issue #115: Allow growing always, shrinking only when devices fit.
 */

import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import { heightToInternalUnits, toHumanUnits } from "./position";

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
 * Check if a rack can be resized to a new height.
 *
 * Rules:
 * - Growing is always allowed.
 * - Shrinking is blocked if any device's top exceeds the new height.
 *
 * Unit note: `device.position` is stored in internal units (1/6U,
 * `UNITS_PER_U = 6`), while `rack.height`, `newHeight`, and `u_height`
 * are in human U. The comparison is performed entirely in internal units
 * to avoid mixing the two systems.
 *
 * @param rack - The rack to check
 * @param newHeight - The proposed new height, in human U
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

  // Shrinking - compare device top to new height in internal units.
  // Mirrors the canonical formula in collision.ts:
  //   topPosition = position + heightInternal - 1
  //   maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1)
  const maxValidTopInternal = newHeight * UNITS_PER_U + (UNITS_PER_U - 1);
  const conflicts: PlacedDevice[] = [];

  for (const device of rack.devices) {
    const deviceType = deviceTypes.find((dt) => dt.slug === device.device_type);
    if (!deviceType) {
      throw new Error(
        `Cannot validate resize: unknown device type "${device.device_type}" for device ${device.name ?? device.id}`,
      );
    }
    const heightInternal = heightToInternalUnits(deviceType.u_height);
    const deviceTopInternal = device.position + heightInternal - 1;

    if (deviceTopInternal > maxValidTopInternal) {
      conflicts.push(device);
    }
  }

  return {
    allowed: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Get human-readable U range text for a device.
 *
 * Converts the internal-unit position back into human U values for display.
 * Fractional bottom positions (e.g. half-U devices on 0.5U boundaries) are
 * rounded up to the nearest whole U so the label remains human-friendly.
 *
 * @example
 * getDeviceRangeText(device, { u_height: 1 }) // "U15"
 * getDeviceRangeText(device, { u_height: 3 }) // "U10-12"
 */
export function getDeviceRangeText(
  device: PlacedDevice,
  deviceType: DeviceType | undefined,
): string {
  if (!deviceType) {
    throw new Error(
      `Cannot format device range: unknown device type "${device.device_type}" for device ${device.name ?? device.id}`,
    );
  }
  const bottom = Math.ceil(toHumanUnits(device.position));
  const top = bottom + Math.ceil(deviceType.u_height) - 1;

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
