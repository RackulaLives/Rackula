/**
 * Pure helpers for keyboard-driven device placement (#106).
 *
 * The keyboard flow arms a device (placement mode), then moves a U-slot cursor
 * within the focused rack with Up/Down and switches racks with Tab / Left-Right.
 * These helpers compute the valid cursor positions and the next cursor when a
 * key is pressed, plus the screen-reader copy. They take plain data (no stores,
 * no DOM) so the navigation maths is unit-testable.
 *
 * "Valid start positions" are the whole-U slots (1-indexed, human units) where
 * the device's bottom can mount without colliding or going out of bounds. The
 * cursor only ever lands on a valid slot, mirroring how the drag preview snaps
 * to a placeable position rather than letting the user hover an occupied slot.
 */

import type { Rack, DeviceType, DeviceFace } from "$lib/types";
import { getDropFeedback } from "./dragdrop";

/**
 * Whole-U start positions (1-indexed, human units, ascending) where `device`
 * can be placed on `face` in `rack`. Uses the same `getDropFeedback` check the
 * tap-to-place valid-slot highlight uses, so the keyboard cursor and the
 * highlight always agree.
 */
export function validStartPositions(
  rack: Rack,
  deviceLibrary: DeviceType[],
  device: DeviceType,
  face: DeviceFace = "front",
): number[] {
  const positions: number[] = [];
  const deviceHeight = device.u_height;
  const lastStart = rack.height - deviceHeight + 1;
  for (let startU = 1; startU <= lastStart; startU++) {
    if (
      getDropFeedback(
        rack,
        deviceLibrary,
        deviceHeight,
        startU,
        undefined,
        face,
      ) === "valid"
    ) {
      positions.push(startU);
    }
  }
  return positions;
}

/**
 * Pick the cursor's starting slot when the cursor first enters a rack.
 * Prefers the valid slot at or nearest below `preferred` (so switching racks
 * keeps the cursor near the same height), else the lowest valid slot. Returns
 * null when the rack has no room for the device.
 */
export function initialCursorPosition(
  validPositions: number[],
  preferred?: number | null,
): number | null {
  if (validPositions.length === 0) return null;
  if (preferred == null) return validPositions[0] ?? null;
  // Nearest valid slot to `preferred` (ties pick the lower slot).
  let best = validPositions[0] ?? null;
  let bestDistance = Infinity;
  for (const p of validPositions) {
    const distance = Math.abs(p - preferred);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }
  return best;
}

/**
 * Move the cursor one valid slot in `direction` (+1 = up the rack toward higher
 * U, -1 = down). Stays put at the ends rather than wrapping, so a screen-reader
 * user is not silently teleported across the rack. Returns the current position
 * unchanged when it is already at the relevant end, or null when there are no
 * valid slots.
 */
export function nextCursorPosition(
  validPositions: number[],
  current: number | null,
  direction: 1 | -1,
): number | null {
  if (validPositions.length === 0) return null;
  if (current == null) return validPositions[0] ?? null;
  const index = validPositions.indexOf(current);
  if (index === -1) {
    // Cursor drifted off a now-invalid slot (e.g. layout changed): snap to the
    // nearest valid slot instead of moving from a stale index.
    return initialCursorPosition(validPositions, current);
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= validPositions.length) return current;
  return validPositions[nextIndex] ?? current;
}

/**
 * Combined pick-up announcement: names the mode, the instructions, and the
 * initial slot in one assertive utterance. A separate instructions-then-position
 * pair would be collapsed by the live region (the second overwrites the first in
 * the same tick), so the seeded position is folded in here.
 */
export function pickUpAnnouncement(
  device: DeviceType,
  rackName: string,
  position: number,
): string {
  const name = device.model ?? device.slug;
  return `Placing ${name} at U${position} of ${rackName}. Use up and down arrows to choose a slot, Tab to switch racks, Enter to place, Escape to cancel.`;
}

/** Instructions announced when the armed rack has no room for the device. */
export function pickUpNoSpaceAnnouncement(
  device: DeviceType,
  rackName: string,
): string {
  const name = device.model ?? device.slug;
  return `Placing ${name}. No space in ${rackName}. Tab to switch racks, Escape to cancel.`;
}

/**
 * Position copy announced as the cursor moves (e.g. "U12 of Rack 1, available").
 * When `atEdge` is set the cursor could not move further in the chosen
 * direction, so a "no further slots" cue is appended; this also changes the
 * string so an assertive live region re-reads it instead of staying silent on
 * an identical repeat.
 */
export function positionAnnouncement(
  rackName: string,
  position: number,
  atEdge = false,
): string {
  const base = `U${position} of ${rackName}, available`;
  return atEdge ? `${base}, no further slots this way` : base;
}

/** Copy announced when a rack has no room for the armed device. */
export function noSpaceAnnouncement(rackName: string): string {
  return `No space for this device in ${rackName}`;
}

/** Copy announced when the user tries to switch racks but there is only one. */
export function singleRackAnnouncement(): string {
  return "Only one rack";
}

/** Copy announced when a device is armed but the layout has no racks. */
export function noRacksAnnouncement(device: DeviceType): string {
  const name = device.model ?? device.slug;
  return `Placing ${name}. Add a rack first.`;
}

/** Outcome copy announced after a successful keyboard placement. */
export function placedAnnouncement(
  device: DeviceType,
  rackName: string,
  position: number,
): string {
  const name = device.model ?? device.slug;
  return `Placed ${name} at U${position} of ${rackName}`;
}
