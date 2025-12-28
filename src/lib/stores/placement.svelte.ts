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
 * Start placement mode with a device.
 * @param device - The device type to place
 * @param face - Target face for half-depth devices (default: 'front')
 */
function startPlacement(device: DeviceType, face: DeviceFace = "front"): void {
  isPlacing = true;
  pendingDevice = device;
  targetFace = face;
}

/**
 * Cancel placement mode without placing the device.
 */
function cancelPlacement(): void {
  isPlacing = false;
  pendingDevice = null;
  targetFace = "front";
}

/**
 * Complete placement mode after successfully placing the device.
 */
function completePlacement(): void {
  isPlacing = false;
  pendingDevice = null;
  targetFace = "front";
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
  isPlacing = false;
  pendingDevice = null;
  targetFace = "front";
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
    startPlacement,
    cancelPlacement,
    completePlacement,
    setTargetFace,
  };
}
