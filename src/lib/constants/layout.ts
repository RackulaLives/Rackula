/**
 * Rack Layout Constants
 * Centralized visual dimensions for rack rendering
 *
 * These values are used across:
 * - Rack.svelte (rendering)
 * - RackDevice.svelte (device positioning)
 * - WelcomeScreen.svelte (ghost rack)
 * - canvas.ts (viewport calculations)
 * - canvas.svelte.ts (device focus)
 * - export.ts (SVG export - imports core values)
 *
 * Export-specific constants (different values for print/export)
 * remain in export.ts to avoid confusion.
 */

// =============================================================================
// Core Rack Dimensions (universal)
// =============================================================================

/**
 * Height of one rack unit (1U) in pixels
 * Industry standard: 1.75" = 44.45mm ≈ 22px at our scale
 */
export const U_HEIGHT_PX = 22;

/**
 * Width of mounting rails and top/bottom bars in pixels
 * Standard rack rail width representation
 */
export const RAIL_WIDTH = 17;

/**
 * Base rack width in pixels for a 19" rack
 * Other widths (10", 23") scale proportionally from this base
 */
export const BASE_RACK_WIDTH = 220;

/**
 * Base padding at top of rack for rack name display (13px font + margin)
 * Used when rack name is visible (standalone rack view)
 */
export const BASE_RACK_PADDING = 18;

/**
 * Reduced padding when rack name is hidden (in dual-view mode or exports)
 * Provides minimal top margin for visual balance
 */
export const RACK_PADDING_HIDDEN = 4;

/**
 * Extra vertical offset above rack name to prevent cutoff on narrow racks
 */
export const NAME_Y_OFFSET = 4;

// =============================================================================
// Canvas Layout
// =============================================================================

/**
 * Padding around rack-row container in the canvas
 */
export const RACK_ROW_PADDING = 16;

/**
 * Gap between front and rear views in dual-view mode
 * Maps to --spacing-lg CSS token
 */
export const DUAL_VIEW_GAP = 24;

/**
 * Extra height added by dual-view wrapper
 * Includes: padding (12+12) + gap (8) + name (~20) + margin (4) = ~56px
 */
export const DUAL_VIEW_EXTRA_HEIGHT = 56;

/**
 * Gap between racks in multi-rack canvas mode (unused in v0.1.1 single-rack)
 * Note: Export uses RACK_GAP = 40 for different spacing
 */
export const RACK_GAP = 24;

// =============================================================================
// Fit-All Viewport Calculations
// =============================================================================

/**
 * Padding around content for fit-all calculation
 * Provides breathing room when fitting content to viewport
 */
export const FIT_ALL_PADDING = 48;

/**
 * Maximum zoom level for fit-all
 * Prevents excessive zoom on small content
 */
export const FIT_ALL_MAX_ZOOM = 2;

/**
 * Padding around racks to account for selection highlight
 * Selection uses: 2px outline + 4px outline-offset = 6px, plus 2px buffer
 */
export const SELECTION_HIGHLIGHT_PADDING = 8;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate rack width based on nominal width in inches
 * Scales proportionally from 19" base width
 * @param nominalWidth - Rack width in inches (10, 19, 21, or 23)
 */
export function getRackWidth(nominalWidth: number): number {
  return Math.round((BASE_RACK_WIDTH * nominalWidth) / 19);
}

/**
 * Calculate interior width (between rails)
 * @param rackWidth - Total rack width in pixels
 */
export function getInteriorWidth(rackWidth: number): number {
  return rackWidth - RAIL_WIDTH * 2;
}

/**
 * Calculate total height in pixels for a given U count
 * @param uCount - Number of rack units
 */
export function getTotalHeight(uCount: number): number {
  return uCount * U_HEIGHT_PX;
}

/**
 * Calculate viewBox height for a rack
 * Includes padding, top bar, U slots, and bottom bar
 * @param uCount - Number of rack units
 * @param hideRackName - Whether rack name is hidden (affects padding)
 */
export function getViewBoxHeight(
  uCount: number,
  hideRackName: boolean,
): number {
  const padding = hideRackName ? RACK_PADDING_HIDDEN : BASE_RACK_PADDING;
  return padding + RAIL_WIDTH * 2 + uCount * U_HEIGHT_PX;
}

/**
 * Calculate dual-view width for a single rack
 * Front and rear views side by side with gap
 */
export function getDualViewWidth(): number {
  return BASE_RACK_WIDTH * 2 + DUAL_VIEW_GAP;
}

/**
 * Calculate dual-view height for a rack
 * Includes rack height plus extra space for view labels
 * @param uCount - Number of rack units
 */
export function getDualViewHeight(uCount: number): number {
  return (
    BASE_RACK_PADDING +
    RAIL_WIDTH * 2 +
    uCount * U_HEIGHT_PX +
    DUAL_VIEW_EXTRA_HEIGHT
  );
}
