/**
 * E2E Test Helpers
 * Consolidated utilities for Playwright tests
 */

// Test layout fixtures
export {
  EMPTY_RACK_SHARE,
  SMALL_RACK_SHARE,
  MEDIUM_RACK_SHARE,
  STANDARD_RACK_SHARE,
  RACK_WITH_DEVICE_SHARE,
  createTestLayout,
  gotoWithRack,
} from "./test-layouts";

// Device actions
export {
  dragDeviceToRack,
  paletteItemByName,
  selectDevice,
  deselectDevice,
  deleteSelectedDevice,
  startEditingDisplayName,
  displayNameInput,
} from "./device-actions";

// Rack wizard setup
export {
  completeWizardWithKeyboard,
  completeWizardWithClicks,
} from "./rack-setup";

// Toolbar actions
export {
  clickNewRack,
  clickSave,
  clickLoad,
  clickExport,
  clickSettings,
  loadFileFromDisk,
  loadFileFromDiskViaMenu,
} from "./toolbar-actions";

// Mobile navigation
export { openDeviceLibraryFromBottomNav } from "./mobile-navigation";

// Multi-context (twin-tab #2044, lazy tab restore #2080)
export {
  openSecondTab,
  readStorageJson,
  collectStorageEvents,
  snapshotStorage,
} from "./multi-context";

// Centralised CSS selectors
export { locators } from "./locators";

// Platform utilities

/** Platform-aware modifier key (Cmd on macOS, Ctrl on Windows/Linux) */
export const PLATFORM_MODIFIER =
  process.platform === "darwin" ? "Meta" : "Control";
