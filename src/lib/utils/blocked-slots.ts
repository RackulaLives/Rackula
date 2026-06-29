/**
 * Blocked Slots Utility
 *
 * Calculates which U slots are blocked by devices on the opposite face.
 * Used for rendering visual indicators in dual-view mode.
 */

import type { Rack, DeviceType, RackView } from "$lib/types";
import { toHumanUnits } from "$lib/utils/position";
import { doRangesOverlap, type URange } from "$lib/utils/collision";
import { effectiveFace } from "./effective-face";

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
    // Find the device type to get height and depth.
    const deviceType = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (!deviceType) continue;

    const face = effectiveFace(placedDevice, deviceType);

    // Same face: visible, no hatching. Full-depth ("both"): visible on both
    // sides, no hatching.
    if (face === view || face === "both") continue;

    // A half-depth device on the opposite face: hatch the slots it occupies.
    // Position is in internal units (6 per U); convert to human units.
    const positionU = toHumanUnits(placedDevice.position);
    const bottom = positionU;
    const top = positionU + deviceType.u_height - 1;

    blocked.push({ bottom, top });
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
  const point: URange = { bottom: position, top: position };
  return blockedSlots.some((range) => doRangesOverlap(point, range));
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
  const deviceRange: URange = { bottom: position, top: position + height - 1 };
  return blockedSlots.some((range) => doRangesOverlap(deviceRange, range));
}
