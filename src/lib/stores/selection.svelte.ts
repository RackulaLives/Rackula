/**
 * Selection Store
 * Manages selection state for racks and devices using Svelte 5 runes
 *
 * v0.5.1: Switched to UUID-based device tracking for stability
 * - Devices are now tracked by unique ID instead of array index
 * - Selection remains valid after device additions/deletions
 */

import type { DeviceFace, PlacedDevice } from "$lib/types";
import { selectionDebug } from "$lib/utils/debug";

// Selection types
type SelectionType = "rack" | "group" | "device" | null;

// The face a device can be selected in is always a concrete rendered view; a
// full-depth device's "both" is never a clickable copy, so it is excluded here.
type SelectedDeviceFace = Exclude<DeviceFace, "both">;

// Module-level state (using $state rune)
let selectedType = $state<SelectionType>(null);
let selectedRackId = $state<string | null>(null);
let selectedGroupId = $state<string | null>(null);
let selectedDeviceId = $state<string | null>(null);
// The view a device was selected in (front or rear). A full-depth device
// renders in both views under one UUID, so callers that position UI against the
// selected element (the floating verb bar, #2646) need to know which copy was
// clicked. Null when unknown (e.g. keyboard or palette selection).
let selectedDeviceFace = $state<SelectedDeviceFace | null>(null);

// Derived values (using $derived rune)
const hasSelection = $derived(selectedType !== null);
const isRackSelected = $derived(selectedType === "rack");
const isGroupSelected = $derived(selectedType === "group");
const isDeviceSelected = $derived(selectedType === "device");

/**
 * Reset the store to initial state (primarily for testing)
 */
export function resetSelectionStore(): void {
  selectedType = null;
  selectedRackId = null;
  selectedGroupId = null;
  selectedDeviceId = null;
  selectedDeviceFace = null;
}

/**
 * Get access to the selection store
 * @returns Store object with state and actions
 */
export function getSelectionStore() {
  return {
    // State getters
    get selectedType() {
      return selectedType;
    },
    get selectedRackId() {
      return selectedRackId;
    },
    get selectedGroupId() {
      return selectedGroupId;
    },
    get selectedDeviceId() {
      return selectedDeviceId;
    },
    get selectedDeviceFace() {
      return selectedDeviceFace;
    },

    // Derived getters
    get hasSelection() {
      return hasSelection;
    },
    get isRackSelected() {
      return isRackSelected;
    },
    get isGroupSelected() {
      return isGroupSelected;
    },
    get isDeviceSelected() {
      return isDeviceSelected;
    },

    // Actions
    selectRack,
    selectGroup,
    selectDevice,
    clearSelection,

    // Helpers
    getSelectedDeviceIndex,
  };
}

/**
 * Select a rack
 * @param rackId - ID of the rack to select
 */
function selectRack(rackId: string): void {
  selectionDebug.state(
    "selectRack: %s (prev: %s/%s)",
    rackId,
    selectedType,
    selectedRackId,
  );
  selectedType = "rack";
  selectedRackId = rackId;
  selectedGroupId = null;
  selectedDeviceId = null;
  selectedDeviceFace = null;
}

/**
 * Select a rack group (bayed rack)
 * @param groupId - ID of the group to select
 * @param activeRackId - ID of the active rack within the group (for panel operations)
 */
function selectGroup(groupId: string, activeRackId?: string): void {
  selectionDebug.state(
    "selectGroup: %s (activeRack: %s, prev: %s/%s)",
    groupId,
    activeRackId,
    selectedType,
    selectedGroupId,
  );
  selectedType = "group";
  selectedRackId = activeRackId ?? null;
  selectedGroupId = groupId;
  selectedDeviceId = null;
  selectedDeviceFace = null;
}

/**
 * Select a device within a rack
 * @param rackId - ID of the rack containing the device
 * @param deviceId - Unique ID of the placed device (UUID)
 * @param face - View the device was clicked in (front or rear); used to anchor
 *   view-relative UI to the correct copy of a full-depth device (#2646).
 *   Omit when the view is unknown (keyboard, palette, programmatic selection).
 */
function selectDevice(
  rackId: string,
  deviceId: string,
  face?: SelectedDeviceFace,
): void {
  selectionDebug.state(
    "selectDevice: %s in rack %s face %s (prev: %s/%s)",
    deviceId,
    rackId,
    face,
    selectedType,
    selectedDeviceId,
  );
  selectedType = "device";
  selectedRackId = rackId;
  selectedGroupId = null;
  selectedDeviceId = deviceId;
  selectedDeviceFace = face ?? null;
}

/**
 * Clear the current selection
 */
function clearSelection(): void {
  selectionDebug.state(
    "clearSelection (prev: %s, rack: %s, group: %s, device: %s)",
    selectedType,
    selectedRackId,
    selectedGroupId,
    selectedDeviceId,
  );
  selectedType = null;
  selectedRackId = null;
  selectedGroupId = null;
  selectedDeviceId = null;
  selectedDeviceFace = null;
}

/**
 * Get the index of the currently selected device in the devices array
 * @param devices - Array of placed devices to search
 * @returns The index of the selected device, or null if not found
 */
function getSelectedDeviceIndex(devices: PlacedDevice[]): number | null {
  if (!selectedDeviceId) return null;
  const index = devices.findIndex((d) => d.id === selectedDeviceId);
  return index >= 0 ? index : null;
}
