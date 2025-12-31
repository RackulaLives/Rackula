/**
 * Sidebar Width Utilities
 * Persistence and management for device library panel width preferences
 */

/** Available sidebar width presets */
export type SidebarWidthPreset = "compact" | "normal" | "wide";

/** Pixel values for each preset */
export const SIDEBAR_WIDTHS: Record<SidebarWidthPreset, number> = {
  compact: 200,
  normal: 280,
  wide: 400,
} as const;

/** Width when sidebar is collapsed */
export const SIDEBAR_COLLAPSED_WIDTH = 40;

/** Valid preset values for validation */
const VALID_PRESETS: readonly SidebarWidthPreset[] = [
  "compact",
  "normal",
  "wide",
] as const;

/** localStorage keys */
const WIDTH_STORAGE_KEY = "Rackula-sidebar-width";
const COLLAPSED_STORAGE_KEY = "Rackula-sidebar-collapsed";

/**
 * Check if a value is a valid SidebarWidthPreset
 */
function isValidPreset(value: string): value is SidebarWidthPreset {
  return VALID_PRESETS.includes(value as SidebarWidthPreset);
}

/**
 * Load sidebar width preset from localStorage
 * @returns The saved preset, or 'normal' as default
 */
export function loadSidebarWidthFromStorage(): SidebarWidthPreset {
  try {
    const stored = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (stored && isValidPreset(stored)) {
      return stored;
    }
  } catch (e) {
    console.warn(
      "[Rackula] Failed to load sidebar width from localStorage:",
      e,
    );
  }
  return "normal";
}

/**
 * Save sidebar width preset to localStorage
 * @param preset - The preset to save
 */
export function saveSidebarWidthToStorage(preset: SidebarWidthPreset): void {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, preset);
  } catch (e) {
    console.warn("[Rackula] Failed to save sidebar width to localStorage:", e);
  }
}

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
 * Get the pixel width for a given preset
 * @param preset - The width preset
 * @returns Pixel width value
 */
export function getPresetWidth(preset: SidebarWidthPreset): number {
  return SIDEBAR_WIDTHS[preset];
}

/**
 * Calculate the effective sidebar width in pixels
 * @param preset - The width preset
 * @param collapsed - Whether the sidebar is collapsed
 * @returns Effective pixel width
 */
export function getEffectiveSidebarWidth(
  preset: SidebarWidthPreset,
  collapsed: boolean,
): number {
  return collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTHS[preset];
}
