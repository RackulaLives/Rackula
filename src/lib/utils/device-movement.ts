/**
 * Device Movement Utility
 * Shared logic for moving devices within a rack, used by both keyboard and mobile handlers.
 * Provides collision-aware movement with leapfrog behavior.
 */

import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { canPlaceDevice } from "./collision";

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

  // Movement increment: use override if provided, otherwise device height
  const moveIncrement = stepOverride ?? deviceType.u_height;
  const isFullDepth = deviceType.is_full_depth !== false;

  // Calculate initial target position
  let newPosition = placedDevice.position + direction * moveIncrement;

  // Check if we're already at the boundary before any movement
  if (direction === 1) {
    // Moving up: check if device is already at top
    const maxPosition = rack.height - deviceType.u_height + 1;
    if (placedDevice.position >= maxPosition) {
      return { success: false, newPosition: null, reason: "at_boundary" };
    }
  } else {
    // Moving down: check if device is already at bottom
    if (placedDevice.position <= 1) {
      return { success: false, newPosition: null, reason: "at_boundary" };
    }
  }

  // Keep looking for a valid position, leapfrogging over blocking devices
  while (
    newPosition >= 1 &&
    newPosition + deviceType.u_height - 1 <= rack.height
  ) {
    // Use canPlaceDevice for face and depth-aware collision detection
    const isValid = canPlaceDevice(
      rack,
      deviceTypes,
      deviceType.u_height,
      newPosition,
      deviceIndex,
      placedDevice.face,
      isFullDepth,
    );

    if (isValid) {
      // Found a valid position
      return { success: true, newPosition, reason: "moved" };
    }

    // Position blocked, try next position in direction (using device height increment)
    newPosition += direction * moveIncrement;
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
