/**
 * Device Grouping Mode Utilities
 * Handles localStorage persistence for device library grouping preferences
 */

import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

const GROUPING_STORAGE_KEY = "Rackula-device-grouping";
/**
 * Device grouping mode for the DevicePalette
 * - 'brand': Generic section with category sub-groups + brand pack sections (default)
 * - 'category': All devices grouped by category, sorted by brand then model within each
 * - 'flat': Single list, all devices sorted alphabetically by model
 */
export type DeviceGroupingMode = "brand" | "category" | "flat";

/**
 * Valid grouping modes for validation
 */
const VALID_MODES: DeviceGroupingMode[] = ["brand", "category", "flat"];

/**
 * Load the saved grouping mode from localStorage
 * @returns The stored mode or 'brand' as default
 */
export function loadGroupingModeFromStorage(): DeviceGroupingMode {
  const stored = safeGetItem(GROUPING_STORAGE_KEY);
  if (stored && VALID_MODES.includes(stored as DeviceGroupingMode)) {
    return stored as DeviceGroupingMode;
  }
  return "brand";
}

/**
 * Save the grouping mode to localStorage
 * @param mode The grouping mode to persist
 */
export function saveGroupingModeToStorage(mode: DeviceGroupingMode): void {
  safeSetItem(GROUPING_STORAGE_KEY, mode);
}
