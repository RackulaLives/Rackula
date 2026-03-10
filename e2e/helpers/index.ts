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
  gotoWithRack,
} from "./test-layouts";

// Device actions
export {
  dragDeviceToRack,
  selectDevice,
  deselectDevice,
  deleteSelectedDevice,
} from "./device-actions";

// Rack wizard setup
export {
  completeWizardWithKeyboard,
  completeWizardWithClicks,
  fillRackForm,
} from "./rack-setup";

// Toolbar actions
export {
  clickNewRack,
  clickSave,
  clickLoad,
  clickExport,
} from "./toolbar-actions";

// Mobile navigation
export { openDeviceLibraryFromBottomNav } from "./mobile-navigation";

// Platform utilities

/** Platform-aware modifier key (Cmd on macOS, Ctrl on Windows/Linux) */
export const PLATFORM_MODIFIER =
  process.platform === "darwin" ? "Meta" : "Control";
