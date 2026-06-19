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
 */
function cancelPlacement(): void {
  placementAnnouncement = "Placement cancelled";
  resetState();
}

/**
 * Complete placement mode after successfully placing the device.
 */
function completePlacement(): void {
  const deviceName = pendingDevice?.model ?? pendingDevice?.slug ?? "Device";
  placementAnnouncement = `${deviceName} placed`;
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
    completePlacement,
    setTargetFace,
  };
}
