/**
 * Selection Store
 * Manages selection state for racks and devices using Svelte 5 runes
 *
 * v0.5.1: Switched to UUID-based device tracking for stability
 * - Devices are now tracked by unique ID instead of array index
 * - Selection remains valid after device additions/deletions
 */

import type { PlacedDevice } from "$lib/types";

// Selection types
type SelectionType = "rack" | "group" | "device" | null;

// Module-level state (using $state rune)
let selectedType = $state<SelectionType>(null);
let selectedRackId = $state<string | null>(null);
let selectedGroupId = $state<string | null>(null);
let selectedDeviceId = $state<string | null>(null);

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
  selectedType = "rack";
  selectedRackId = rackId;
  selectedGroupId = null;
  selectedDeviceId = null;
}

/**
 * Select a rack group (bayed rack)
 * @param groupId - ID of the group to select
 */
function selectGroup(groupId: string): void {
  selectedType = "group";
  selectedRackId = null;
  selectedGroupId = groupId;
  selectedDeviceId = null;
}

/**
 * Select a device within a rack
 * @param rackId - ID of the rack containing the device
 * @param deviceId - Unique ID of the placed device (UUID)
 */
function selectDevice(rackId: string, deviceId: string): void {
  selectedType = "device";
  selectedRackId = rackId;
  selectedGroupId = null;
  selectedDeviceId = deviceId;
}

/**
 * Clear the current selection
 */
function clearSelection(): void {
  selectedType = null;
  selectedRackId = null;
  selectedGroupId = null;
  selectedDeviceId = null;
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
