/**
 * Device Movement Utility
 * Shared logic for moving devices within a rack, used by both keyboard and mobile handlers.
 * Provides collision-aware movement with leapfrog behavior.
 */

import type { Rack, DeviceType, PlacedDevice } from "$lib/types";
import { canPlaceDevice, isContainerChild } from "./collision";
import { UNITS_PER_U, heightToInternalUnits } from "./position";

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
 * @returns MoveResult indicating success/failure and new position
 */
export function findNextValidPosition(
  rack: Rack,
  deviceTypes: DeviceType[],
  deviceIndex: number,
  direction: MoveDirection,
): MoveResult {
  const placedDevice = rack.devices[deviceIndex];
  if (!placedDevice) {
    return { success: false, newPosition: null, reason: "no_valid_position" };
  }

  // Container children use container-relative positions and are excluded from
  // rack-level collision. A rack-level move would compute a rack U and shed the
  // container linkage (see moveDeviceRecorded), ejecting the child from its
  // container. Vertical position nudging must not do that, so report no valid
  // position. Deliberate detachment happens via drag-out, not nudge controls.
  if (isContainerChild(placedDevice)) {
    return { success: false, newPosition: null, reason: "no_valid_position" };
  }

  const deviceType = deviceTypes.find(
    (d) => d.slug === placedDevice.device_type,
  );
  if (!deviceType) {
    return { success: false, newPosition: null, reason: "no_valid_position" };
  }

  // Device height in internal units (used for boundary checks).
  const deviceHeightInternal = heightToInternalUnits(deviceType.u_height);

  // Carrier-first: rail-mounted gear sits at whole-U boundaries only, so nudge
  // moves one full U at a time. Sub-U / half-width gear lives inside a carrier
  // (a container child), which is rejected above before reaching this point.
  const moveIncrementInternal = UNITS_PER_U;

  // Calculate initial target position (all positions are in internal units)
  let newPosition = placedDevice.position + direction * moveIncrementInternal;

  // Boundary values in internal units
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
 * Human-readable feedback for a blocked nudge, or null when the move succeeded.
 *
 * The mobile selection inspector disables its Move Up / Move Down controls when
 * a nudge is impossible, but a tap that still reaches a blocked move must give
 * the user a reason rather than silently doing nothing. This turns the shared
 * MoveResult into that message so the mobile handler reuses the same collision
 * logic the desktop edit panel uses, without reimplementing it.
 *
 * @param result - The outcome from findNextValidPosition
 * @param direction - 1 for up (higher U), -1 for down (lower U)
 * @returns A feedback message when the move was blocked, or null when it moved
 */
export function getMoveBlockedMessage(
  result: MoveResult,
  direction: MoveDirection,
): string | null {
  if (result.success) return null;

  const directionWord = direction === 1 ? "up" : "down";

  if (result.reason === "at_boundary") {
    const edge = direction === 1 ? "top" : "bottom";
    return `Already at the ${edge} of the rack`;
  }

  return `No free slot to move ${directionWord}`;
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
