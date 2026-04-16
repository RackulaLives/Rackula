/**
 * Sidebar Width Utilities
 * Persistence and management for device library panel width
 */

import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

/** localStorage key for sidebar width */
const WIDTH_STORAGE_KEY = "Rackula-sidebar-width";

/**
 * Load sidebar width from localStorage
 * @returns The saved width in pixels, or null if not set
 */
export function loadSidebarWidthFromStorage(): number | null {
  const stored = safeGetItem(WIDTH_STORAGE_KEY);
  if (stored !== null) {
    const width = parseInt(stored, 10);
    if (!isNaN(width) && width > 0) {
      return width;
    }
  }
  return null;
}

/**
 * Save sidebar width to localStorage
 * @param width - Width in pixels
 */
export function saveSidebarWidthToStorage(width: number): void {
  safeSetItem(WIDTH_STORAGE_KEY, String(Math.round(width)));
}
