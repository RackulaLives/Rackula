/**
 * Blocked Slots Utility
 *
 * Calculates which U slots are blocked by devices on the opposite face.
 * Used for rendering visual indicators in dual-view mode.
 */

import type { Rack, DeviceType, RackView, SlotPosition } from "$lib/types";
import { toHumanUnits } from "$lib/utils/position";

/**
 * Represents a range of U positions (inclusive) with optional slot positioning
 */
export interface URange {
  bottom: number; // Lower U position
  top: number; // Upper U position
  /** Slot position for half-width devices. undefined = full-width */
  slotPosition?: SlotPosition;
}

/**
 * Calculate which U slots should show hatching for the given view.
 *
 * Hatching indicates "there's a device here on the other side that you can't see".
 * This happens when:
 * - A half-depth device is on the OPPOSITE face (is_full_depth=false)
 *
 * Full-depth devices are visible from both sides, so they don't need hatching.
 * Face='both' devices are always visible on both faces, so no hatching needed.
 *
 * @param rack - The rack containing devices
 * @param view - The view to calculate blocked slots for ('front' or 'rear')
 * @param deviceLibrary - Array of device types to look up device heights
 * @returns Array of U ranges that should show hatching
 */
export function getBlockedSlots(
  rack: Rack,
  view: RackView,
  deviceLibrary: DeviceType[],
): URange[] {
  const blocked: URange[] = [];

  for (const placedDevice of rack.devices) {
    // Skip devices on the same face (they're visible, no need for hatching)
    if (placedDevice.face === view) continue;

    // Skip 'both' face devices (they're visible on both faces)
    if (placedDevice.face === "both") continue;

    // Find the device type to get height and full-depth info
    const deviceType = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (!deviceType) continue;

    // Check if this device is half-depth
    // Only half-depth devices need hatching (full-depth devices are visible from both sides)
    const isFullDepth = deviceType.is_full_depth !== false; // undefined or true = full depth

    // Skip full-depth devices (they're visible from both sides, rendered as actual devices)
    if (isFullDepth) continue;

    // Calculate the U range this half-depth device occupies
    // Position is in internal units (6 per U), convert to human units for rendering
    const positionU = toHumanUnits(placedDevice.position);
    const bottom = positionU;
    const top = positionU + deviceType.u_height - 1;

    // Determine slot position for half-width devices
    // slot_width: 1 = half-width, 2 or undefined = full-width
    const isHalfWidth = deviceType.slot_width === 1;
    const slotPosition = isHalfWidth ? placedDevice.slot_position : undefined;

    blocked.push({ bottom, top, slotPosition });
  }

  return blocked;
}

/**
 * Check if a specific U position is blocked
 *
 * @param blockedSlots - Array of blocked U ranges
 * @param position - The U position to check
 * @returns true if the position is blocked
 */
export function isPositionBlocked(
  blockedSlots: URange[],
  position: number,
): boolean {
  return blockedSlots.some(
    (range) => position >= range.bottom && position <= range.top,
  );
}

/**
 * Check if a device at a given position would overlap with blocked slots
 *
 * @param blockedSlots - Array of blocked U ranges
 * @param position - Starting U position for the device
 * @param height - Height of the device in U
 * @returns true if any part of the device would be in a blocked slot
 */
export function wouldOverlapBlocked(
  blockedSlots: URange[],
  position: number,
  height: number,
): boolean {
  const deviceTop = position + height - 1;

  return blockedSlots.some(
    (range) =>
      // Device starts within blocked range
      (position >= range.bottom && position <= range.top) ||
      // Device ends within blocked range
      (deviceTop >= range.bottom && deviceTop <= range.top) ||
      // Device spans entire blocked range
      (position < range.bottom && deviceTop > range.top),
  );
}
