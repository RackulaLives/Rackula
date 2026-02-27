/**
 * Device Grouping Mode Utilities
 * Handles localStorage persistence for device library grouping preferences
 */

const GROUPING_STORAGE_KEY = "Rackula-device-grouping";
const COMPATIBLE_ONLY_STORAGE_KEY = "Rackula-device-compatible-only";

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
  try {
    const stored = localStorage.getItem(GROUPING_STORAGE_KEY);
    if (stored && VALID_MODES.includes(stored as DeviceGroupingMode)) {
      return stored as DeviceGroupingMode;
    }
  } catch (e) {
    console.warn(
      "[Rackula] Failed to load grouping mode from localStorage:",
      e,
    );
  }
  return "brand";
}

/**
 * Save the grouping mode to localStorage
 * @param mode The grouping mode to persist
 */
export function saveGroupingModeToStorage(mode: DeviceGroupingMode): void {
  try {
    localStorage.setItem(GROUPING_STORAGE_KEY, mode);
  } catch (e) {
    console.warn("[Rackula] Failed to save grouping mode to localStorage:", e);
  }
}

/**
 * Load the saved compatible-only preference from localStorage.
 * @returns Stored boolean value, or true by default.
 */
export function loadCompatibleOnlyFromStorage(): boolean {
  try {
    const stored = localStorage.getItem(COMPATIBLE_ONLY_STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch (e) {
    console.warn(
      "[Rackula] Failed to load compatible-only mode from localStorage:",
      e,
    );
  }
  return true;
}

/**
 * Save compatible-only preference to localStorage.
 */
export function saveCompatibleOnlyToStorage(value: boolean): void {
  try {
    localStorage.setItem(COMPATIBLE_ONLY_STORAGE_KEY, String(value));
  } catch (e) {
    console.warn(
      "[Rackula] Failed to save compatible-only mode to localStorage:",
      e,
    );
  }
}
