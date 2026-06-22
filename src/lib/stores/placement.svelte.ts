/**
 * Placement Store
 * Manages tap-to-place and keyboard-place workflow state.
 * Tracks the pending device being placed, the target face, and (for the
 * keyboard flow) a U-slot cursor within a target rack.
 */

import type { DeviceType, DeviceFace } from "$lib/types";

// State
let isPlacing = $state(false);
let pendingDevice = $state<DeviceType | null>(null);
let targetFace = $state<DeviceFace>("front");

/**
 * Keyboard placement cursor.
 * `targetRackId` is the rack the cursor is currently in; `cursorPosition` is the
 * highlighted whole-U slot (1-indexed) within that rack. Both are null while no
 * keyboard cursor is active (e.g. pure pointer tap-to-place never sets them).
 */
let targetRackId = $state<string | null>(null);
let cursorPosition = $state<number | null>(null);

/**
 * Screen-reader announcement for placement state transitions.
 * Set on pick-up, slot change, cancel, and complete so assistive technologies
 * can announce the mode and position. Cleared on the next startPlacement so
 * stale text is never re-read.
 */
let placementAnnouncement = $state<string | null>(null);

/**
 * Start placement mode with a device.
 * @param device - The device type to place
 * @param face - Target face for half-depth devices (default: 'front')
 */
function startPlacement(device: DeviceType, face: DeviceFace = "front"): void {
  placementAnnouncement = null;
  isPlacing = true;
  pendingDevice = device;
  targetFace = face;
  targetRackId = null;
  cursorPosition = null;
}

/**
 * Internal helper to reset placement state.
 * Used by cancel, complete, and resetPlacementStore.
 */
function resetState(): void {
  isPlacing = false;
  pendingDevice = null;
  targetFace = "front";
  targetRackId = null;
  cursorPosition = null;
}

/**
 * Cancel placement mode without placing the device.
 * Announces "Placement cancelled" to screen readers via the assertive live region.
 * Use abandonPlacement() for silent internal resets that should not be announced.
 */
function cancelPlacement(): void {
  if (isPlacing) {
    placementAnnouncement = "Placement cancelled";
  }
  resetState();
}

/**
 * Silently abandon placement without a screen-reader announcement.
 * Use this when placement is being cleared as an internal side-effect of another
 * action (e.g. a drag-and-drop completing while click-to-place was still armed),
 * not when the user has explicitly cancelled. cancelPlacement() would announce
 * "Placement cancelled" in that case, which would be misleading.
 */
function abandonPlacement(): void {
  resetState();
}

/**
 * Complete placement mode after successfully placing the device.
 * `summary` overrides the announcement (the keyboard flow passes a rich
 * "Placed X at U12 of Rack 1" string); without it the default names the device.
 */
function completePlacement(summary?: string): void {
  if (isPlacing) {
    const deviceName = pendingDevice?.model ?? pendingDevice?.slug ?? "Device";
    placementAnnouncement = summary ?? `${deviceName} placed`;
  }
  resetState();
}

/**
 * Change the target face for placement (for half-depth devices).
 * @param face - The face to target ('front' or 'rear')
 */
function setTargetFace(face: DeviceFace): void {
  targetFace = face;
}

/**
 * Move the keyboard cursor to a rack and U-slot. Setting the cursor does not
 * place anything; it only drives the preview and the position announcement.
 * Passing `position: null` targets the rack with no slot (e.g. switching to a
 * full rack), keeping `targetRackId` and `cursorPosition` consistent so the
 * preview never shows on a stale rack.
 * @param rackId - Rack the cursor is in
 * @param position - Whole-U slot (1-indexed) within that rack, or null for none
 */
function setCursor(rackId: string, position: number | null): void {
  targetRackId = rackId;
  // Rail positions are whole-U integers (carrier-first model); reject a
  // fractional slot rather than carry it into placement.
  cursorPosition = position == null ? null : Math.round(position);
}

/**
 * Set the live position announcement (e.g. "U12 of Rack 1, available").
 * Kept separate from completePlacement so slot changes announce without ending
 * placement.
 */
function announcePosition(text: string): void {
  placementAnnouncement = text;
}

/**
 * Reset placement store state (for testing).
 */
export function resetPlacementStore(): void {
  placementAnnouncement = null;
  resetState();
}

/**
 * Get the placement store with reactive state and actions.
 * @returns Store object with getters and actions
 */
export function getPlacementStore() {
  return {
    get isPlacing() {
      return isPlacing;
    },
    get pendingDevice() {
      return pendingDevice;
    },
    get targetFace() {
      return targetFace;
    },
    /** Rack the keyboard cursor is in, or null when no keyboard cursor is active. */
    get targetRackId() {
      return targetRackId;
    },
    /** Highlighted whole-U slot (1-indexed) of the keyboard cursor, or null. */
    get cursorPosition() {
      return cursorPosition;
    },
    /**
     * Screen-reader announcement text for the most recent placement state
     * transition (mode entered, position changed, placed, or cancelled). Null
     * while idle. Rendered in an assertive aria-live region so screen readers
     * announce it immediately.
     */
    get placementAnnouncement() {
      return placementAnnouncement;
    },
    startPlacement,
    cancelPlacement,
    abandonPlacement,
    completePlacement,
    setTargetFace,
    setCursor,
    announcePosition,
  };
}
