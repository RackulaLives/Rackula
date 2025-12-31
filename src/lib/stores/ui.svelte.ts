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
  loadSidebarCollapsedFromStorage,
  saveSidebarCollapsedToStorage,
  getEffectiveSidebarWidth,
  type SidebarWidthPreset,
} from "$lib/utils/sidebarWidth";
import type { DisplayMode, AnnotationField } from "$lib/types";

// Zoom constants
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 25;

// Load initial values from storage
const initialTheme = loadThemeFromStorage();
const initialSidebarWidth = loadSidebarWidthFromStorage();
const initialSidebarCollapsed = loadSidebarCollapsedFromStorage();

// Module-level state (using $state rune)
let theme = $state<Theme>(initialTheme);
let zoom = $state(100);
let leftDrawerOpen = $state(false);
let rightDrawerOpen = $state(false);
let displayMode = $state<DisplayMode>("label");
let showAnnotations = $state(false);
let annotationField = $state<AnnotationField>("name");
let showBanana = $state(false);
let sidebarWidth = $state<SidebarWidthPreset>(initialSidebarWidth);
let sidebarCollapsed = $state(initialSidebarCollapsed);

// Derived values (using $derived rune)
const canZoomIn = $derived(zoom < ZOOM_MAX);
const canZoomOut = $derived(zoom > ZOOM_MIN);
const zoomScale = $derived(zoom / 100);
// Derive showLabelsOnImages from displayMode for backward compatibility
const showLabelsOnImages = $derived(displayMode === "image-label");
// Derive effective sidebar width in pixels based on preset and collapsed state
const sidebarWidthPx = $derived(
  getEffectiveSidebarWidth(sidebarWidth, sidebarCollapsed),
);

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
  sidebarCollapsed = loadSidebarCollapsedFromStorage();
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

    // Sidebar width state getters
    get sidebarWidth() {
      return sidebarWidth;
    },
    get sidebarCollapsed() {
      return sidebarCollapsed;
    },
    get sidebarWidthPx() {
      return sidebarWidthPx;
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

    // Sidebar width actions
    setSidebarWidth,
    toggleSidebarCollapsed,
    collapseSidebar,
    expandSidebar,
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
 * Set sidebar width preset
 * @param preset - Width preset to set
 */
function setSidebarWidth(preset: SidebarWidthPreset): void {
  sidebarWidth = preset;
  saveSidebarWidthToStorage(preset);
}

/**
 * Toggle sidebar collapsed state
 */
function toggleSidebarCollapsed(): void {
  sidebarCollapsed = !sidebarCollapsed;
  saveSidebarCollapsedToStorage(sidebarCollapsed);
}

/**
 * Collapse the sidebar
 */
function collapseSidebar(): void {
  if (!sidebarCollapsed) {
    sidebarCollapsed = true;
    saveSidebarCollapsedToStorage(true);
  }
}

/**
 * Expand the sidebar
 */
function expandSidebar(): void {
  if (sidebarCollapsed) {
    sidebarCollapsed = false;
    saveSidebarCollapsedToStorage(false);
  }
}
