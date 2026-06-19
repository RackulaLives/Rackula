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
import type { DisplayMode, AnnotationField } from "$lib/types";
import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";

// Sidebar tab type (hide removed - collapse is now gesture-based)
export type SidebarTab = "devices" | "racks" | "layouts";

// Right side panel tab type: Edit (contextual properties) and View (layout view toggles)
export type SidePanelTab = "edit" | "view";

// localStorage keys
const SIDEBAR_TAB_KEY = "Rackula_sidebar_tab";
const SIDEBAR_COLLAPSED_KEY = "Rackula_sidebar_collapsed";
const SIDE_PANEL_TAB_KEY = "Rackula_side_panel_tab";
const SIDE_PANEL_COLLAPSED_KEY = "Rackula_side_panel_collapsed";
const WARN_UNSAVED_KEY = "Rackula_warn_unsaved";
const PROMPT_CLEANUP_KEY = "Rackula_prompt_cleanup";
const COMPATIBLE_ONLY_KEY = "Rackula-device-compatible-only";

/**
 * Valid sidebar tab values for runtime validation
 */
const VALID_SIDEBAR_TABS: readonly SidebarTab[] = [
  "devices",
  "racks",
  "layouts",
] as const;

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
  const stored = safeGetItem(SIDEBAR_TAB_KEY);
  // Handle legacy "hide" value - migrate to "devices" and persist
  if (stored === "hide") {
    safeSetItem(SIDEBAR_TAB_KEY, "devices");
    return "devices";
  }
  if (stored && isValidSidebarTab(stored)) {
    return stored;
  }
  return "devices"; // default
}

/**
 * Save sidebar tab to localStorage
 */
function saveSidebarTabToStorage(tab: SidebarTab): void {
  safeSetItem(SIDEBAR_TAB_KEY, tab);
}

/**
 * Load left sidebar collapse state from localStorage
 */
function loadSidebarCollapsedFromStorage(): boolean {
  return safeGetItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

/**
 * Save left sidebar collapse state to localStorage
 */
function saveSidebarCollapsedToStorage(collapsed: boolean): void {
  safeSetItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
}

/**
 * Valid side panel tab values for runtime validation
 */
const VALID_SIDE_PANEL_TABS: readonly SidePanelTab[] = [
  "edit",
  "view",
] as const;

/**
 * Check if a value is a valid SidePanelTab
 */
function isValidSidePanelTab(tab: string): tab is SidePanelTab {
  return VALID_SIDE_PANEL_TABS.includes(tab as SidePanelTab);
}

/**
 * Load side panel tab from localStorage
 */
function loadSidePanelTabFromStorage(): SidePanelTab {
  const stored = safeGetItem(SIDE_PANEL_TAB_KEY);
  if (stored && isValidSidePanelTab(stored)) {
    return stored;
  }
  return "edit"; // default
}

/**
 * Save side panel tab to localStorage
 */
function saveSidePanelTabToStorage(tab: SidePanelTab): void {
  safeSetItem(SIDE_PANEL_TAB_KEY, tab);
}

/**
 * Load side panel collapse state from localStorage
 */
function loadSidePanelCollapsedFromStorage(): boolean {
  return safeGetItem(SIDE_PANEL_COLLAPSED_KEY) === "true";
}

/**
 * Save side panel collapse state to localStorage
 */
function saveSidePanelCollapsedToStorage(collapsed: boolean): void {
  safeSetItem(SIDE_PANEL_COLLAPSED_KEY, String(collapsed));
}

/**
 * Load warn on unsaved changes setting from localStorage
 */
function loadWarnUnsavedFromStorage(): boolean {
  const stored = safeGetItem(WARN_UNSAVED_KEY);
  if (stored !== null) {
    return stored === "true";
  }
  return true; // default to warning enabled
}

/**
 * Save warn on unsaved changes setting to localStorage
 */
function saveWarnUnsavedToStorage(warn: boolean): void {
  safeSetItem(WARN_UNSAVED_KEY, String(warn));
}

/**
 * Load compatible-only preference from localStorage
 */
function loadCompatibleOnlyFromStorage(): boolean {
  const stored = safeGetItem(COMPATIBLE_ONLY_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return true; // default to compatible-only enabled
}

/**
 * Save compatible-only preference to localStorage
 */
function saveCompatibleOnlyToStorage(value: boolean): void {
  safeSetItem(COMPATIBLE_ONLY_KEY, String(value));
}

/**
 * Load prompt cleanup on save setting from localStorage
 */
function loadPromptCleanupFromStorage(): boolean {
  const stored = safeGetItem(PROMPT_CLEANUP_KEY);
  if (stored !== null) {
    return stored === "true";
  }
  return true; // default to prompting enabled
}

/**
 * Save prompt cleanup on save setting to localStorage
 */
function savePromptCleanupToStorage(prompt: boolean): void {
  safeSetItem(PROMPT_CLEANUP_KEY, String(prompt));
}

// Zoom constants
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 25;

// Load initial values from storage
const initialTheme = loadThemeFromStorage();
const initialSidebarTab = loadSidebarTabFromStorage();
const initialSidebarCollapsed = loadSidebarCollapsedFromStorage();
const initialSidePanelTab = loadSidePanelTabFromStorage();
const initialSidePanelCollapsed = loadSidePanelCollapsedFromStorage();
const initialWarnUnsaved = loadWarnUnsavedFromStorage();
const initialPromptCleanup = loadPromptCleanupFromStorage();
const initialCompatibleOnly = loadCompatibleOnlyFromStorage();

// Module-level state (using $state rune)
let theme = $state<Theme>(initialTheme);
let zoom = $state(100);
let leftDrawerOpen = $state(false);
let rightDrawerOpen = $state(false);
let displayMode = $state<DisplayMode>("label");
let showAnnotations = $state(false);
let annotationField = $state<AnnotationField>("name");
let showBanana = $state(false);
let sidebarTab = $state<SidebarTab>(initialSidebarTab);
let sidebarCollapsed = $state(initialSidebarCollapsed);
let sidePanelTab = $state<SidePanelTab>(initialSidePanelTab);
let sidePanelCollapsed = $state(initialSidePanelCollapsed);
let warnOnUnsavedChanges = $state(initialWarnUnsaved);
let promptCleanupOnSave = $state(initialPromptCleanup);
let compatibleOnly = $state(initialCompatibleOnly);
// Read-only lock: presentation safety valve that locks the layout for viewing.
// Session-scoped (not persisted) so a reload always returns to an editable state.
let readOnly = $state(false);

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
  sidebarTab = loadSidebarTabFromStorage();
  sidebarCollapsed = loadSidebarCollapsedFromStorage();
  sidePanelTab = loadSidePanelTabFromStorage();
  sidePanelCollapsed = loadSidePanelCollapsedFromStorage();
  warnOnUnsavedChanges = loadWarnUnsavedFromStorage();
  promptCleanupOnSave = loadPromptCleanupFromStorage();
  compatibleOnly = loadCompatibleOnlyFromStorage();
  readOnly = false;
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
    get sidebarTab() {
      return sidebarTab;
    },
    get sidebarCollapsed() {
      return sidebarCollapsed;
    },
    get sidePanelTab() {
      return sidePanelTab;
    },
    get sidePanelCollapsed() {
      return sidePanelCollapsed;
    },
    get warnOnUnsavedChanges() {
      return warnOnUnsavedChanges;
    },
    get promptCleanupOnSave() {
      return promptCleanupOnSave;
    },
    get compatibleOnly() {
      return compatibleOnly;
    },

    // Read-only lock state getter
    get readOnly() {
      return readOnly;
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
    setAnnotations,
    setAnnotationField,

    // Easter egg actions
    toggleBanana,

    // Sidebar actions
    setSidebarTab,
    toggleSidebarCollapsed,
    setSidebarCollapsed,

    // Side panel actions
    setSidePanelTab,
    toggleSidePanelCollapsed,
    setSidePanelCollapsed,

    // Unsaved changes warning action
    toggleWarnOnUnsavedChanges,

    // Cleanup prompt actions
    togglePromptCleanupOnSave,
    setPromptCleanupOnSave,

    // Compatible-only filter action
    toggleCompatibleOnly,

    // Read-only lock actions
    toggleReadOnly,
    setReadOnly,
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
 * Set annotation column visibility explicitly
 * @param enabled - Whether annotations should be visible
 */
function setAnnotations(enabled: boolean): void {
  showAnnotations = enabled;
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
 * Set the sidebar tab
 * @param tab - Tab to set ('devices', 'racks', or 'layouts')
 */
function setSidebarTab(tab: SidebarTab): void {
  if (!isValidSidebarTab(tab)) return;
  sidebarTab = tab;
  saveSidebarTabToStorage(tab);
}

/**
 * Toggle the left sidebar between expanded and collapsed-to-strip
 */
function toggleSidebarCollapsed(): void {
  setSidebarCollapsed(!sidebarCollapsed);
}

/**
 * Set the left sidebar collapse state explicitly
 * @param collapsed - Whether the sidebar is collapsed to its strip
 */
function setSidebarCollapsed(collapsed: boolean): void {
  sidebarCollapsed = collapsed;
  saveSidebarCollapsedToStorage(collapsed);
}

/**
 * Set the active right side panel tab
 * @param tab - Tab to set ('edit' or 'view')
 */
function setSidePanelTab(tab: SidePanelTab): void {
  if (!isValidSidePanelTab(tab)) return;
  sidePanelTab = tab;
  saveSidePanelTabToStorage(tab);
}

/**
 * Toggle the right side panel between expanded and collapsed-to-rail
 */
function toggleSidePanelCollapsed(): void {
  setSidePanelCollapsed(!sidePanelCollapsed);
}

/**
 * Set the right side panel collapse state explicitly
 * @param collapsed - Whether the panel is collapsed to its rail
 */
function setSidePanelCollapsed(collapsed: boolean): void {
  sidePanelCollapsed = collapsed;
  saveSidePanelCollapsedToStorage(collapsed);
}

/**
 * Toggle warn on unsaved changes setting
 */
function toggleWarnOnUnsavedChanges(): void {
  warnOnUnsavedChanges = !warnOnUnsavedChanges;
  saveWarnUnsavedToStorage(warnOnUnsavedChanges);
}

/**
 * Toggle prompt cleanup on save setting
 */
function togglePromptCleanupOnSave(): void {
  promptCleanupOnSave = !promptCleanupOnSave;
  savePromptCleanupToStorage(promptCleanupOnSave);
}

/**
 * Set prompt cleanup on save setting
 * @param prompt - Whether to prompt for cleanup before save/export
 */
function setPromptCleanupOnSave(prompt: boolean): void {
  promptCleanupOnSave = prompt;
  savePromptCleanupToStorage(prompt);
}

/**
 * Toggle compatible-only device filter
 */
function toggleCompatibleOnly(): void {
  compatibleOnly = !compatibleOnly;
  saveCompatibleOnlyToStorage(compatibleOnly);
}

/**
 * Toggle the read-only lock
 */
function toggleReadOnly(): void {
  readOnly = !readOnly;
}

/**
 * Set the read-only lock state explicitly
 * @param locked - Whether the layout is locked for viewing
 */
function setReadOnly(locked: boolean): void {
  readOnly = locked;
}
