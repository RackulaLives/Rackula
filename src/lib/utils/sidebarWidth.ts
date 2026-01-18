/**
 * Sidebar Width Utilities
 * Persistence and management for device library panel width
 */

/** localStorage key for sidebar width */
const WIDTH_STORAGE_KEY = "Rackula-sidebar-width";

/**
 * Load sidebar width from localStorage
 * @returns The saved width in pixels, or null if not set
 */
export function loadSidebarWidthFromStorage(): number | null {
  try {
    const stored = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (stored !== null) {
      const width = parseInt(stored, 10);
      if (!isNaN(width) && width > 0) {
        return width;
      }
    }
  } catch (e) {
    console.warn(
      "[Rackula] Failed to load sidebar width from localStorage:",
      e,
    );
  }
  return null;
}

/**
 * Save sidebar width to localStorage
 * @param width - Width in pixels
 */
export function saveSidebarWidthToStorage(width: number): void {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch (e) {
    console.warn(
      "[Rackula] Failed to save sidebar width to localStorage:",
      e,
    );
  }
}
