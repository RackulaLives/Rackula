/**
 * Sidebar Width Utilities
 * Persistence and management for device library panel collapsed state
 */

/** Width when sidebar is open */
export const SIDEBAR_OPEN_WIDTH = 320;

/** Width when sidebar is collapsed */
export const SIDEBAR_COLLAPSED_WIDTH = 40;

/** localStorage key for collapsed state */
const COLLAPSED_STORAGE_KEY = "Rackula-sidebar-collapsed";

/**
 * Load sidebar collapsed state from localStorage
 * @returns The saved collapsed state, or false as default
 */
export function loadSidebarCollapsedFromStorage(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return stored === "true";
  } catch (e) {
    console.warn(
      "[Rackula] Failed to load sidebar collapsed state from localStorage:",
      e,
    );
  }
  return false;
}

/**
 * Save sidebar collapsed state to localStorage
 * @param collapsed - Whether the sidebar is collapsed
 */
export function saveSidebarCollapsedToStorage(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(COLLAPSED_STORAGE_KEY);
    }
  } catch (e) {
    console.warn(
      "[Rackula] Failed to save sidebar collapsed state to localStorage:",
      e,
    );
  }
}

/**
 * Calculate the effective sidebar width in pixels
 * @param collapsed - Whether the sidebar is collapsed
 * @returns Effective pixel width
 */
export function getEffectiveSidebarWidth(collapsed: boolean): number {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_OPEN_WIDTH;
}
