/**
 * Placement Store
 * Manages tap-to-place workflow state for mobile editing.
 * Tracks the pending device being placed and target face.
 */

import type { DeviceType, DeviceFace } from "$lib/types";

// State
let isPlacing = $state(false);
let pendingDevice = $state<DeviceType | null>(null);
let targetFace = $state<DeviceFace>("front");

/**
 * Screen-reader announcement for placement state transitions.
 * Set on cancel and complete so assistive technologies can announce the outcome.
 * Cleared on the next startPlacement so stale text is never re-read.
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
}

/**
 * Internal helper to reset placement state.
 * Used by cancel, complete, and resetPlacementStore.
 */
function resetState(): void {
  isPlacing = false;
  pendingDevice = null;
  targetFace = "front";
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
 */
function completePlacement(): void {
  if (isPlacing) {
    const deviceName = pendingDevice?.model ?? pendingDevice?.slug ?? "Device";
    placementAnnouncement = `${deviceName} placed`;
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
    /**
     * Screen-reader announcement text for the most recent placement state
     * transition (placed or cancelled). Null while idle or during active
     * placement. Rendered in an assertive aria-live region so screen readers
     * announce the outcome immediately.
     */
    get placementAnnouncement() {
      return placementAnnouncement;
    },
    startPlacement,
    cancelPlacement,
    abandonPlacement,
    completePlacement,
    setTargetFace,
  };
}
