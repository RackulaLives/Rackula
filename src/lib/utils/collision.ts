/**
 * Collision Detection System
 * Functions for device placement validation
 *
 * Container Hierarchy Rules:
 * - Container devices collide at rack level (they occupy space)
 * - Child devices (container_id set) are EXCLUDED from rack-level collision
 * - Child devices collide ONLY within their container (same container_id)
 * - Child position is 0-indexed relative to container bottom
 */

import type {
  DeviceType,
  DeviceFace,
  PlacedDevice,
  Rack,
  SlotPosition,
  Slot,
} from "$lib/types";
import { UNITS_PER_U, heightToInternalUnits } from "$lib/utils/position";

// Re-export SlotPosition for test imports
export type { SlotPosition } from "$lib/types";

/**
 * Check if a placed device is a container child
 * Container children have container_id set and are excluded from rack-level collision
 */
export function isContainerChild(device: PlacedDevice): boolean {
  return device.container_id !== undefined;
}

/**
 * Range of U positions occupied by a device
 */
export interface URange {
  bottom: number;
  top: number;
}

/**
 * Get the range occupied by a device at a given position in internal units.
 * For rack-level devices, position is in internal units (6 = U1).
 * For container children, use getContainerChildRange instead.
 *
 * @param position - Bottom position in internal units (e.g., 6 for U1)
 * @param heightU - Device height in U (e.g., 2 for a 2U device)
 * @returns Range of internal unit positions {bottom, top}
 */
export function getDeviceURange(position: number, heightU: number): URange {
  const heightInternal = heightToInternalUnits(heightU);
  return {
    bottom: position,
    top: position + heightInternal - 1,
  };
}

/**
 * Get the range occupied by a container child device.
 * Container children use 0-indexed positions relative to the container,
 * and do NOT use the internal unit system.
 *
 * @param position - 0-indexed position from container bottom
 * @param heightU - Device height in U
 * @returns Range of positions {bottom, top}
 */
function getContainerChildRange(position: number, heightU: number): URange {
  return {
    bottom: position,
    top: position + heightU - 1,
  };
}

/**
 * Check if two U ranges overlap
 * @param rangeA - First range
 * @param rangeB - Second range
 * @returns true if ranges overlap (including edge touch)
 */
export function doRangesOverlap(rangeA: URange, rangeB: URange): boolean {
  // Ranges overlap if one starts before or at the other's end
  // and ends after or at the other's start
  return rangeA.bottom <= rangeB.top && rangeA.top >= rangeB.bottom;
}

/**
 * Check if two device faces would collide
 *
 * Face is authoritative for collision detection:
 * - 'both' always collides with everything
 * - Same face always collides
 * - Opposite explicit faces (front/rear) never collide
 *
 * @param faceA - First device face ('front', 'rear', or 'both')
 * @param faceB - Second device face ('front', 'rear', or 'both')
 * @returns true if devices on these faces would collide
 */
export function doFacesCollide(faceA: DeviceFace, faceB: DeviceFace): boolean {
  // 'both' collides with everything
  if (faceA === "both" || faceB === "both") {
    return true;
  }
  // Same face always collides
  if (faceA === faceB) {
    return true;
  }
  // Opposite explicit faces never collide (face is authoritative)
  return false;
}

/**
 * Check if two slot positions overlap
 * @param slotA - First slot position ('left', 'right', or 'full')
 * @param slotB - Second slot position ('left', 'right', or 'full')
 * @returns true if the slots overlap
 */
export function doSlotsOverlap(
  slotA: SlotPosition,
  slotB: SlotPosition,
): boolean {
  // 'full' overlaps with everything
  if (slotA === "full" || slotB === "full") {
    return true;
  }
  // Same slot position overlaps
  if (slotA === slotB) {
    return true;
  }
  // 'left' and 'right' don't overlap
  return false;
}

/**
 * Check if a slot position is occupied at a given position in the rack.
 * Used to validate half-width device slot movement.
 *
 * @param rack - The rack to check
 * @param position - The position (in internal units) to check
 * @param targetSlot - The slot position to check ('left', 'right', or 'full')
 * @param excludeIndex - Optional device index to exclude (for current device)
 * @returns true if the target slot is occupied by another device
 */
export function isSlotOccupied(
  rack: Rack,
  position: number,
  targetSlot: SlotPosition,
  excludeIndex?: number,
): boolean {
  return rack.devices.some((device, i) => {
    // Skip the device being moved
    if (excludeIndex !== undefined && i === excludeIndex) return false;
    // Only check devices at the same position
    if (device.position !== position) return false;
    // Skip container children - they're in a different collision space
    if (device.container_id) return false;

    const existingSlot = device.slot_position ?? "full";
    // Check if the slots would overlap
    return doSlotsOverlap(existingSlot, targetSlot);
  });
}

/**
 * Check if a device can be placed at a given position (rack-level placement)
 *
 * Container children (devices with container_id set) are excluded from rack-level
 * collision detection. They exist in a separate collision space within their container.
 *
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param deviceHeight - Height of device to place (in U)
 * @param targetPosition - Target bottom position in internal units (e.g., 6 for U1)
 * @param excludeIndex - Optional index in rack.devices to exclude (for move operations)
 * @param targetFace - Optional face to place device on (default: 'front')
 * @param targetSlot - Optional slot position (default: 'full')
 * @returns true if placement is valid
 */
export function canPlaceDevice(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetPosition: number,
  excludeIndex?: number,
  targetFace: DeviceFace = "front",
  targetSlot: SlotPosition = "full",
): boolean {
  // Position must be >= UNITS_PER_U (U1 in internal units)
  if (targetPosition < UNITS_PER_U) {
    return false;
  }

  // Device must fit within rack height (convert rack height to internal units)
  // A device at position P with height H occupies P to P + H*UNITS_PER_U - 1
  // For a rack of height N, the max valid top is the top of UN = N*UNITS_PER_U + (UNITS_PER_U - 1)
  const topPosition = targetPosition + heightToInternalUnits(deviceHeight) - 1;
  const maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1);
  if (topPosition > maxValidTop) {
    return false;
  }

  // Check for collisions with existing devices
  const newRange = getDeviceURange(targetPosition, deviceHeight);

  for (let i = 0; i < rack.devices.length; i++) {
    // Skip the excluded device (for move operations)
    if (excludeIndex !== undefined && i === excludeIndex) {
      continue;
    }

    const placedDevice = rack.devices[i]!;

    // Skip container children - they don't participate in rack-level collision
    if (isContainerChild(placedDevice)) {
      continue;
    }

    const device = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (device) {
      const existingRange = getDeviceURange(
        placedDevice.position,
        device.u_height,
      );
      // Get existing device's slot position (default to 'full')
      const existingSlot: SlotPosition = placedDevice.slot_position ?? "full";
      // Check U range overlap AND face collision AND slot overlap
      // Face is authoritative: only the explicit face value matters for collision
      if (
        doRangesOverlap(newRange, existingRange) &&
        doFacesCollide(targetFace, placedDevice.face) &&
        doSlotsOverlap(targetSlot, existingSlot)
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Find devices that would collide with a new device at given position (rack-level)
 *
 * Container children are excluded from rack-level collision detection.
 *
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param newDeviceHeight - Height of new device
 * @param newPosition - Target position
 * @param excludeIndex - Optional index in rack.devices to exclude (for move operations)
 * @param targetFace - Optional face to place device on (default: 'front')
 * @param targetSlot - Optional slot position (default: 'full')
 * @returns Array of colliding PlacedDevices (only rack-level devices, not container children)
 */
export function findCollisions(
  rack: Rack,
  deviceLibrary: DeviceType[],
  newDeviceHeight: number,
  newPosition: number,
  excludeIndex?: number,
  targetFace: DeviceFace = "front",
  targetSlot: SlotPosition = "full",
): PlacedDevice[] {
  const collisions: PlacedDevice[] = [];
  const newRange = getDeviceURange(newPosition, newDeviceHeight);

  rack.devices.forEach((placedDevice, index) => {
    // Skip the excluded device (for move operations)
    if (excludeIndex !== undefined && index === excludeIndex) {
      return;
    }

    // Skip container children - they don't participate in rack-level collision
    if (isContainerChild(placedDevice)) {
      return;
    }

    const device = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (device) {
      const existingRange = getDeviceURange(
        placedDevice.position,
        device.u_height,
      );
      // Get existing device's slot position (default to 'full')
      const existingSlot: SlotPosition = placedDevice.slot_position ?? "full";
      // Check U range overlap AND face collision AND slot overlap
      // Face is authoritative: only the explicit face value matters for collision
      if (
        doRangesOverlap(newRange, existingRange) &&
        doFacesCollide(targetFace, placedDevice.face) &&
        doSlotsOverlap(targetSlot, existingSlot)
      ) {
        collisions.push(placedDevice);
      }
    }
  });

  return collisions;
}

/**
 * Find all valid positions where a device of given height can be placed
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param deviceHeight - Height of device to place (in U)
 * @param targetFace - Optional face to place device on (default: 'front')
 * @param targetSlot - Optional slot position (default: 'full')
 * @returns Array of valid bottom positions in internal units, sorted ascending
 */
export function findValidDropPositions(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetFace: DeviceFace = "front",
  targetSlot: SlotPosition = "full",
): number[] {
  const validPositions: number[] = [];

  // Check each possible position in internal units
  // Start at U1 (UNITS_PER_U) and go up to the max position where device fits
  // Max valid top = rack.height * UNITS_PER_U + (UNITS_PER_U - 1)
  // Max valid bottom = maxValidTop - deviceHeightInternal + 1
  const deviceHeightInternal = heightToInternalUnits(deviceHeight);
  const maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1);
  const maxPosition = maxValidTop - deviceHeightInternal + 1;

  for (let position = UNITS_PER_U; position <= maxPosition; position++) {
    if (
      canPlaceDevice(
        rack,
        deviceLibrary,
        deviceHeight,
        position,
        undefined,
        targetFace,
        targetSlot,
      )
    ) {
      validPositions.push(position);
    }
  }

  return validPositions;
}

/**
 * Convert Y coordinate to internal unit position
 * @param y - Y coordinate (0 at top of rack SVG)
 * @param rackHeight - Total rack height in U
 * @param uHeight - Height of one U in pixels
 * @returns Position in internal units (e.g., 6 for U1)
 */
function yToInternalPosition(
  y: number,
  rackHeight: number,
  uHeight: number,
): number {
  // SVG has y=0 at top, U=1 at bottom
  // First get U position, then convert to internal units
  const uPosition = rackHeight - Math.floor(y / uHeight);
  return uPosition * UNITS_PER_U;
}

/**
 * Snap to the nearest valid drop position
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param deviceHeight - Height of device to place (in U)
 * @param targetY - Target Y coordinate in pixels
 * @param uHeight - Height of one U in pixels
 * @returns Nearest valid position in internal units, or null if no valid positions
 */
export function snapToNearestValidPosition(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetY: number,
  uHeight: number,
): number | null {
  const validPositions = findValidDropPositions(
    rack,
    deviceLibrary,
    deviceHeight,
  );

  if (validPositions.length === 0) {
    return null;
  }

  // Convert target Y to approximate internal unit position
  const targetPosition = yToInternalPosition(targetY, rack.height, uHeight);

  // Find the closest valid position
  let closestPosition = validPositions[0]!;
  let closestDistance = Math.abs(targetPosition - closestPosition);

  for (const position of validPositions) {
    const distance = Math.abs(targetPosition - position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPosition = position;
    }
  }

  return closestPosition;
}

/**
 * Check if a device type fits within a slot's dimensions and category restrictions.
 * Validates that the child device's width and height fit within the slot,
 * and that the device category is allowed by the slot (if slot.accepts is defined).
 *
 * slot_width mapping:
 * - 1 = half-width device (requires width_fraction >= 0.5)
 * - 2 = full-width device (requires width_fraction >= 1.0)
 * - Default (2) = full width device
 *
 * @param childType - The device type to place
 * @param slot - The target slot
 * @returns true if device fits and is allowed, false otherwise
 */
export function canPlaceInSlot(childType: DeviceType, slot: Slot): boolean {
  // Check category is allowed (if slot.accepts is defined)
  // Empty accepts array or undefined means all categories allowed
  if (slot.accepts && slot.accepts.length > 0) {
    if (!slot.accepts.includes(childType.category)) {
      return false;
    }
  }

  // Convert slot_width to fraction (1=0.5, 2=1.0)
  // Default slot_width is 2 (full-width), which requires full width_fraction
  const slotWidth = childType.slot_width ?? 2;
  const requiredFraction = slotWidth === 1 ? 0.5 : 1.0;

  // Check width fits
  const availableFraction = slot.width_fraction ?? 1.0;
  if (requiredFraction > availableFraction + 0.01) {
    // +0.01 for floating point tolerance
    return false;
  }

  // Check height fits (child u_height <= slot height_units)
  const slotHeight = slot.height_units ?? 1;
  if (childType.u_height > slotHeight) {
    return false;
  }

  return true;
}

/**
 * Check if a device can be placed inside a container at a specific slot and position
 *
 * Container children:
 * - Position is 0-indexed relative to container bottom
 * - Must fit within container height
 * - Only collide with siblings in the same container AND same slot
 * - Inherit face from parent container
 *
 * @param rack - The rack containing the container
 * @param deviceLibrary - The device library
 * @param container - The parent container PlacedDevice
 * @param containerType - The DeviceType of the container
 * @param childType - The DeviceType of the child device to place
 * @param targetSlotId - The slot ID within the container
 * @param targetPosition - Target position (0-indexed from container bottom)
 * @param excludeDeviceId - Optional device ID to exclude (for move operations)
 * @returns true if placement is valid
 */
export function canPlaceInContainer(
  rack: Rack,
  deviceLibrary: DeviceType[],
  container: PlacedDevice,
  containerType: DeviceType,
  childType: DeviceType,
  targetSlotId: string,
  targetPosition: number,
  excludeDeviceId?: string,
): boolean {
  // Position must be >= 0 (0-indexed within container)
  if (targetPosition < 0) {
    return false;
  }

  // Child device must fit within container height
  const topPosition = targetPosition + childType.u_height - 1;
  if (topPosition >= containerType.u_height) {
    return false;
  }

  // Validate target slot exists and check dimension fit
  const targetSlot = containerType.slots?.find((s) => s.id === targetSlotId);
  if (!targetSlot) {
    return false;
  }

  // Check if child device dimensions fit within the slot
  if (!canPlaceInSlot(childType, targetSlot)) {
    return false;
  }

  // Find all sibling devices in the same container and slot
  // Container children use 0-indexed positions, not internal units
  const newRange = getContainerChildRange(targetPosition, childType.u_height);

  for (const device of rack.devices) {
    // Only check devices in the same container
    if (device.container_id !== container.id) {
      continue;
    }

    // Skip the device being moved
    if (excludeDeviceId !== undefined && device.id === excludeDeviceId) {
      continue;
    }

    // Only check devices in the same slot
    if (device.slot_id !== targetSlotId) {
      continue;
    }

    // Get the sibling's device type for height
    const siblingType = deviceLibrary.find(
      (dt) => dt.slug === device.device_type,
    );
    if (!siblingType) {
      continue;
    }

    // Container children use 0-indexed positions, not internal units
    const existingRange = getContainerChildRange(
      device.position,
      siblingType.u_height,
    );

    // Check for U range overlap within the slot
    if (doRangesOverlap(newRange, existingRange)) {
      return false;
    }
  }

  return true;
}
