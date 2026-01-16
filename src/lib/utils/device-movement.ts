/**
 * Device Movement Utility
 * Shared logic for moving devices within a rack, used by both keyboard and mobile handlers.
 * Provides collision-aware movement with leapfrog behavior.
 */

import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { canPlaceDevice } from "./collision";
import {
  UNITS_PER_U,
  toInternalUnits,
  heightToInternalUnits,
} from "./position";

/**
 * Result of attempting to find a valid position for device movement
 */
export interface MoveResult {
  /** Whether a valid position was found */
  success: boolean;
  /** The new position if successful, null otherwise */
  newPosition: number | null;
  /** Reason for the result */
  reason: "moved" | "at_boundary" | "no_valid_position";
}

/**
 * Direction for device movement
 * 1 = up (higher U number), -1 = down (lower U number)
 */
export type MoveDirection = 1 | -1;

/**
 * Find the next valid position for a device in the given direction.
 * Implements leapfrog behavior: if immediate position is blocked,
 * continues searching in the direction until a valid position is found.
 *
 * @param rack - The rack containing the device
 * @param deviceTypes - Device type definitions for collision checking
 * @param deviceIndex - Index of the device in rack.devices array
 * @param direction - 1 for up (higher U), -1 for down (lower U)
 * @param stepOverride - Optional step size (default: device height). Use 0.5 for fine movement.
 * @returns MoveResult indicating success/failure and new position
 */
export function findNextValidPosition(
  rack: Rack,
  deviceTypes: DeviceType[],
  deviceIndex: number,
  direction: MoveDirection,
  stepOverride?: number,
): MoveResult {
  const placedDevice = rack.devices[deviceIndex];
  if (!placedDevice) {
    return { success: false, newPosition: null, reason: "no_valid_position" };
  }

  const deviceType = deviceTypes.find(
    (d) => d.slug === placedDevice.device_type,
  );
  if (!deviceType) {
    return { success: false, newPosition: null, reason: "no_valid_position" };
  }

  // Movement increment in internal units:
  // If stepOverride is provided (in human U), convert it; otherwise use device height
  const moveIncrementInternal = stepOverride
    ? toInternalUnits(stepOverride)
    : heightToInternalUnits(deviceType.u_height);

  // Calculate initial target position (all positions are in internal units)
  let newPosition = placedDevice.position + direction * moveIncrementInternal;

  // Boundary values in internal units
  const deviceHeightInternal = heightToInternalUnits(deviceType.u_height);
  const maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1);

  // Check if we're already at the boundary before any movement
  if (direction === 1) {
    // Moving up: check if device is already at top
    // Max bottom position = maxValidTop - deviceHeightInternal + 1
    const maxBottomPosition = maxValidTop - deviceHeightInternal + 1;
    if (placedDevice.position >= maxBottomPosition) {
      return { success: false, newPosition: null, reason: "at_boundary" };
    }
  } else {
    // Moving down: check if device is already at bottom (U1 = UNITS_PER_U)
    if (placedDevice.position <= UNITS_PER_U) {
      return { success: false, newPosition: null, reason: "at_boundary" };
    }
  }

  // Keep looking for a valid position, leapfrogging over blocking devices
  // Min position = UNITS_PER_U (U1), max top = maxValidTop
  while (
    newPosition >= UNITS_PER_U &&
    newPosition + deviceHeightInternal - 1 <= maxValidTop
  ) {
    // Use canPlaceDevice for face-aware collision detection
    // Face is authoritative: the device's face value determines blocking
    const isValid = canPlaceDevice(
      rack,
      deviceTypes,
      deviceType.u_height,
      newPosition,
      deviceIndex,
      placedDevice.face,
    );

    if (isValid) {
      // Found a valid position
      return { success: true, newPosition, reason: "moved" };
    }

    // Position blocked, try next position in direction (using device height increment)
    newPosition += direction * moveIncrementInternal;
  }

  // No valid position found in that direction
  return { success: false, newPosition: null, reason: "no_valid_position" };
}

/**
 * Check if a device can move up (higher U position)
 * Useful for enabling/disabling move buttons in UI
 *
 * @param rack - The rack containing the device
 * @param deviceTypes - Device type definitions
 * @param deviceIndex - Index of the device in rack.devices array
 * @returns true if the device can move up
 */
export function canMoveUp(
  rack: Rack,
  deviceTypes: DeviceType[],
  deviceIndex: number,
): boolean {
  const result = findNextValidPosition(rack, deviceTypes, deviceIndex, 1);
  return result.success;
}

/**
 * Check if a device can move down (lower U position)
 * Useful for enabling/disabling move buttons in UI
 *
 * @param rack - The rack containing the device
 * @param deviceTypes - Device type definitions
 * @param deviceIndex - Index of the device in rack.devices array
 * @returns true if the device can move down
 */
export function canMoveDown(
  rack: Rack,
  deviceTypes: DeviceType[],
  deviceIndex: number,
): boolean {
  const result = findNextValidPosition(rack, deviceTypes, deviceIndex, -1);
  return result.success;
}

/**
 * Get the placed device and its type for a given index
 * Helper function to reduce boilerplate in callers
 *
 * @param rack - The rack containing the device
 * @param deviceTypes - Device type definitions
 * @param deviceIndex - Index of the device in rack.devices array
 * @returns Object with device and deviceType, or null if not found
 */
export function getDeviceWithType(
  rack: Rack,
  deviceTypes: DeviceType[],
  deviceIndex: number,
): { device: PlacedDevice; deviceType: DeviceType } | null {
  const device = rack.devices[deviceIndex];
  if (!device) return null;

  const deviceType = deviceTypes.find((d) => d.slug === device.device_type);
  if (!deviceType) return null;

  return { device, deviceType };
}
