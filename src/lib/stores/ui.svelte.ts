/**
 * UI Store
 * Manages theme, zoom, drawer state, and display mode using Svelte 5 runes
 */

import {
  loadThemeFromStorage,
  saveThemeToStorage,
  applyThemeToDocument,
  type Theme,
} from "$lib/utils/theme";
import {
  loadSidebarWidthFromStorage,
  saveSidebarWidthToStorage,
} from "$lib/utils/sidebarWidth";
import type { DisplayMode, AnnotationField } from "$lib/types";

// Sidebar tab type (hide removed - collapse is now gesture-based)
export type SidebarTab = "devices" | "racks";

// localStorage keys
const SIDEBAR_TAB_KEY = "Rackula_sidebar_tab";
const WARN_UNSAVED_KEY = "Rackula_warn_unsaved";

/**
 * Valid sidebar tab values for runtime validation
 */
const VALID_SIDEBAR_TABS: readonly SidebarTab[] = ["devices", "racks"] as const;

/**
 * Check if a value is a valid SidebarTab
 */
function isValidSidebarTab(tab: string): tab is SidebarTab {
  return VALID_SIDEBAR_TABS.includes(tab as SidebarTab);
}

/**
 * Load sidebar tab from localStorage
 * Note: Legacy "hide" values are migrated to "devices"
 */
function loadSidebarTabFromStorage(): SidebarTab {
  try {
    const stored = localStorage.getItem(SIDEBAR_TAB_KEY);
    // Handle legacy "hide" value - migrate to "devices" and persist
    if (stored === "hide") {
      localStorage.setItem(SIDEBAR_TAB_KEY, "devices");
      return "devices";
    }
    if (stored && isValidSidebarTab(stored)) {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "devices"; // default
}

/**
 * Save sidebar tab to localStorage
 */
function saveSidebarTabToStorage(tab: SidebarTab): void {
  try {
    localStorage.setItem(SIDEBAR_TAB_KEY, tab);
  } catch {
    // localStorage not available
  }
}

/**
 * Load warn on unsaved changes setting from localStorage
 */
function loadWarnUnsavedFromStorage(): boolean {
  try {
    const stored = localStorage.getItem(WARN_UNSAVED_KEY);
    if (stored !== null) {
      return stored === "true";
    }
  } catch {
    // localStorage not available
  }
  return true; // default to warning enabled
}

/**
 * Save warn on unsaved changes setting to localStorage
 */
function saveWarnUnsavedToStorage(warn: boolean): void {
  try {
    localStorage.setItem(WARN_UNSAVED_KEY, String(warn));
  } catch {
    // localStorage not available
  }
}

// Zoom constants
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 25;

// Load initial values from storage
const initialTheme = loadThemeFromStorage();
const initialSidebarWidth = loadSidebarWidthFromStorage();
const initialSidebarTab = loadSidebarTabFromStorage();
const initialWarnUnsaved = loadWarnUnsavedFromStorage();

// Module-level state (using $state rune)
let theme = $state<Theme>(initialTheme);
let zoom = $state(100);
let leftDrawerOpen = $state(false);
let rightDrawerOpen = $state(false);
let displayMode = $state<DisplayMode>("label");
let showAnnotations = $state(false);
let annotationField = $state<AnnotationField>("name");
let showBanana = $state(false);
let sidebarWidth = $state<number | null>(initialSidebarWidth);
let sidebarTab = $state<SidebarTab>(initialSidebarTab);
let warnOnUnsavedChanges = $state(initialWarnUnsaved);

// Derived values (using $derived rune)
const canZoomIn = $derived(zoom < ZOOM_MAX);
const canZoomOut = $derived(zoom > ZOOM_MIN);
const zoomScale = $derived(zoom / 100);
// Derive showLabelsOnImages from displayMode for backward compatibility
const showLabelsOnImages = $derived(displayMode === "image-label");

// Apply initial theme to document (using the non-reactive initial value)
applyThemeToDocument(initialTheme);

/**
 * Reset the store to initial state (primarily for testing)
 */
export function resetUIStore(): void {
  theme = loadThemeFromStorage();
  zoom = 100;
  leftDrawerOpen = false;
  rightDrawerOpen = false;
  displayMode = "label";
  showAnnotations = false;
  annotationField = "name";
  showBanana = false;
  sidebarWidth = loadSidebarWidthFromStorage();
  sidebarTab = loadSidebarTabFromStorage();
  warnOnUnsavedChanges = loadWarnUnsavedFromStorage();
  applyThemeToDocument(theme);
}

/**
 * Get access to the UI store
 * @returns Store object with state and actions
 */
export function getUIStore() {
  return {
    // Theme state getters
    get theme() {
      return theme;
    },

    // Zoom state getters
    get zoom() {
      return zoom;
    },
    get canZoomIn() {
      return canZoomIn;
    },
    get canZoomOut() {
      return canZoomOut;
    },
    get zoomScale() {
      return zoomScale;
    },

    // Drawer state getters
    get leftDrawerOpen() {
      return leftDrawerOpen;
    },
    get rightDrawerOpen() {
      return rightDrawerOpen;
    },

    // Display mode state getters
    get displayMode() {
      return displayMode;
    },
    get showLabelsOnImages() {
      return showLabelsOnImages;
    },

    // Annotation state getters
    get showAnnotations() {
      return showAnnotations;
    },
    get annotationField() {
      return annotationField;
    },

    // Easter egg state getters
    get showBanana() {
      return showBanana;
    },

    // Sidebar state getters
    get sidebarWidth() {
      return sidebarWidth;
    },
    get sidebarTab() {
      return sidebarTab;
    },
    get warnOnUnsavedChanges() {
      return warnOnUnsavedChanges;
    },

    // Theme actions
    toggleTheme,
    setTheme,

    // Zoom actions
    zoomIn,
    zoomOut,
    setZoom,
    resetZoom,

    // Drawer actions
    toggleLeftDrawer,
    toggleRightDrawer,
    openLeftDrawer,
    closeLeftDrawer,
    openRightDrawer,
    closeRightDrawer,

    // Display mode actions
    toggleDisplayMode,
    setDisplayMode,

    // Annotation actions
    toggleAnnotations,
    setAnnotationField,

    // Easter egg actions
    toggleBanana,

    // Sidebar actions
    setSidebarWidth: setSidebarWidthAction,
    setSidebarTab,

    // Unsaved changes warning action
    toggleWarnOnUnsavedChanges,
  };
}

/**
 * Toggle between dark and light themes
 */
function toggleTheme(): void {
  const newTheme: Theme = theme === "dark" ? "light" : "dark";
  setTheme(newTheme);
}

/**
 * Set a specific theme
 * @param newTheme - Theme to set
 */
function setTheme(newTheme: Theme): void {
  theme = newTheme;
  saveThemeToStorage(newTheme);
  applyThemeToDocument(newTheme);
}

/**
 * Zoom in by one step
 */
function zoomIn(): void {
  if (zoom < ZOOM_MAX) {
    zoom = Math.min(zoom + ZOOM_STEP, ZOOM_MAX);
  }
}

/**
 * Zoom out by one step
 */
function zoomOut(): void {
  if (zoom > ZOOM_MIN) {
    zoom = Math.max(zoom - ZOOM_STEP, ZOOM_MIN);
  }
}

/**
 * Set zoom level (clamped to valid range)
 * @param value - Zoom percentage
 */
function setZoom(value: number): void {
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

/**
 * Reset zoom to 100%
 */
function resetZoom(): void {
  zoom = 100;
}

/**
 * Toggle left drawer visibility
 */
function toggleLeftDrawer(): void {
  leftDrawerOpen = !leftDrawerOpen;
}

/**
 * Toggle right drawer visibility
 */
function toggleRightDrawer(): void {
  rightDrawerOpen = !rightDrawerOpen;
}

/**
 * Open left drawer
 */
function openLeftDrawer(): void {
  leftDrawerOpen = true;
}

/**
 * Close left drawer
 */
function closeLeftDrawer(): void {
  leftDrawerOpen = false;
}

/**
 * Open right drawer
 */
function openRightDrawer(): void {
  rightDrawerOpen = true;
}

/**
 * Close right drawer
 */
function closeRightDrawer(): void {
  rightDrawerOpen = false;
}

/**
 * Display mode cycle order
 */
const DISPLAY_MODE_ORDER: DisplayMode[] = ["label", "image", "image-label"];

/**
 * Toggle display mode through: label → image → image-label → label
 */
function toggleDisplayMode(): void {
  const currentIndex = DISPLAY_MODE_ORDER.indexOf(displayMode);
  const nextIndex = (currentIndex + 1) % DISPLAY_MODE_ORDER.length;
  displayMode = DISPLAY_MODE_ORDER[nextIndex] ?? "label";
}

/**
 * Set display mode to a specific value
 * @param mode - Display mode to set ('label', 'image', or 'image-label')
 */
function setDisplayMode(mode: DisplayMode): void {
  if (DISPLAY_MODE_ORDER.includes(mode)) {
    displayMode = mode;
  }
}

/**
 * Toggle annotation column visibility
 */
function toggleAnnotations(): void {
  showAnnotations = !showAnnotations;
}

/**
 * Valid annotation field values for runtime validation
 */
const VALID_ANNOTATION_FIELDS: readonly AnnotationField[] = [
  "name",
  "ip",
  "notes",
  "asset_tag",
  "serial",
  "manufacturer",
] as const;

/**
 * Check if a value is a valid AnnotationField
 */
function isValidAnnotationField(field: string): field is AnnotationField {
  return VALID_ANNOTATION_FIELDS.includes(field as AnnotationField);
}

/**
 * Set annotation field to display
 * @param field - Annotation field to display
 */
function setAnnotationField(field: AnnotationField): void {
  if (isValidAnnotationField(field)) {
    annotationField = field;
  }
}

/**
 * Toggle banana for scale easter egg
 */
function toggleBanana(): void {
  showBanana = !showBanana;
}

/**
 * Set the sidebar width
 * @param width - Width in pixels (must be finite and positive)
 */
function setSidebarWidthAction(width: number): void {
  // Validate input: must be a finite positive number
  if (!Number.isFinite(width) || width <= 0) {
    return;
  }
  sidebarWidth = width;
  saveSidebarWidthToStorage(width);
}

/**
 * Set the sidebar tab
 * @param tab - Tab to set ('hide', 'devices', or 'racks')
 */
function setSidebarTab(tab: SidebarTab): void {
  if (!isValidSidebarTab(tab)) return;
  sidebarTab = tab;
  saveSidebarTabToStorage(tab);
}

/**
 * Toggle warn on unsaved changes setting
 */
function toggleWarnOnUnsavedChanges(): void {
  warnOnUnsavedChanges = !warnOnUnsavedChanges;
  saveWarnUnsavedToStorage(warnOnUnsavedChanges);
}
