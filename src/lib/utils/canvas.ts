/**
 * Canvas Utility Functions
 * Calculations for fit-all zoom and rack positioning
 * Supports multi-rack mode with bayed rack groups
 */

import type { Rack, RackGroup } from "$lib/types";
import {
  U_HEIGHT_PX,
  BASE_RACK_WIDTH,
  RAIL_WIDTH,
  BASE_RACK_PADDING,
  RACK_GAP,
  RACK_ROW_PADDING,
  DUAL_VIEW_GAP,
  DUAL_VIEW_EXTRA_HEIGHT,
  FIT_ALL_PADDING,
  FIT_ALL_MAX_ZOOM,
  SELECTION_HIGHLIGHT_PADDING,
} from "$lib/constants/layout";

/**
 * Bounding box interface
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rack position interface for bounding box calculation
 */
export interface RackPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fit-all result with zoom and pan values
 */
export interface FitAllResult {
  zoom: number;
  panX: number;
  panY: number;
}

// FIT_ALL_PADDING and FIT_ALL_MAX_ZOOM imported from layout constants

/**
 * Calculate the bounding box that encompasses all racks.
 *
 * @param racks - Array of rack positions with x, y, width, height
 * @returns Bounding box { x, y, width, height } or zero bounds for empty array
 */
export function calculateRacksBoundingBox(racks: RackPosition[]): Bounds {
  if (racks.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rack of racks) {
    minX = Math.min(minX, rack.x);
    minY = Math.min(minY, rack.y);
    maxX = Math.max(maxX, rack.x + rack.width);
    maxY = Math.max(maxY, rack.y + rack.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Minimum zoom level (must match ZOOM_MIN in canvas store)
 */
const FIT_ALL_MIN_ZOOM = 0.25;

/**
 * Calculate zoom and pan values to fit all racks in the viewport.
 *
 * The calculation:
 * 1. Find bounding box of all racks
 * 2. Add padding around the content
 * 3. Calculate zoom to fit content in viewport
 * 4. Clamp zoom between min (50%) and max (200%)
 * 5. Calculate pan to center content (using clamped zoom)
 *
 * @param racks - Array of rack positions
 * @param viewportWidth - Width of the viewport in pixels
 * @param viewportHeight - Height of the viewport in pixels
 * @returns { zoom, panX, panY } values for panzoom
 */
export function calculateFitAll(
  racks: RackPosition[],
  viewportWidth: number,
  viewportHeight: number,
): FitAllResult {
  if (racks.length === 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  const bounds = calculateRacksBoundingBox(racks);

  // The actual visual content includes the rack-row's CSS padding
  const visualContentWidth = bounds.width + RACK_ROW_PADDING * 2;
  const visualContentHeight = bounds.height + RACK_ROW_PADDING * 2;

  // For zoom calculation, add extra visual margin (FIT_ALL_PADDING) around the content
  const contentWithMarginWidth = visualContentWidth + FIT_ALL_PADDING * 2;
  const contentWithMarginHeight = visualContentHeight + FIT_ALL_PADDING * 2;

  // Calculate zoom to fit content with margin in viewport
  const zoomX = viewportWidth / contentWithMarginWidth;
  const zoomY = viewportHeight / contentWithMarginHeight;

  // Use smaller zoom to ensure content fits, clamp between min and max
  const zoom = Math.max(
    FIT_ALL_MIN_ZOOM,
    Math.min(zoomX, zoomY, FIT_ALL_MAX_ZOOM),
  );

  // Calculate pan to center the visual content (rack-row) in viewport
  const scaledContentWidth = visualContentWidth * zoom;
  const scaledContentHeight = visualContentHeight * zoom;

  // Pan formula: center the scaled content in the viewport
  let panX = (viewportWidth - scaledContentWidth) / 2;
  let panY = (viewportHeight - scaledContentHeight) / 2;

  if (scaledContentWidth > viewportWidth) {
    // Content wider than viewport - align to left edge with small padding
    panX = FIT_ALL_PADDING;
  }

  if (scaledContentHeight > viewportHeight) {
    // Content taller than viewport - align to top edge with small padding
    panY = FIT_ALL_PADDING;
  }

  return { zoom, panX, panY };
}

// =============================================================================
// Bayed Rack Dimension Constants
// =============================================================================

/** Width of U-labels column in bayed rack view */
const U_LABELS_WIDTH = 32;

/**
 * Base height overhead for bayed rack groups
 * Includes: container padding (24) + row labels (40) + gaps (32) + row overhead (76)
 */
const BAYED_GROUP_HEIGHT_BASE = 172;

/** Additional height when group has a name */
const BAYED_GROUP_NAME_HEIGHT = 24;

// =============================================================================
// Position Calculation Functions
// =============================================================================

/**
 * Calculate dimensions for a single ungrouped rack.
 * When show_rear is true: dual-view mode (front and rear side-by-side)
 * When show_rear is false: single-view mode (front only)
 */
function getDualViewDimensions(rack: Rack): { width: number; height: number } {
  // Scale rack width based on nominal width (BASE_RACK_WIDTH is calibrated for 19" racks)
  const rackWidthPx = Math.round((BASE_RACK_WIDTH * rack.width) / 19);

  // Width depends on whether rear view is shown
  const width = rack.show_rear
    ? rackWidthPx * 2 + DUAL_VIEW_GAP // Dual view: front + gap + rear
    : rackWidthPx; // Single view: front only

  const height =
    BASE_RACK_PADDING +
    RAIL_WIDTH * 2 +
    rack.height * U_HEIGHT_PX +
    DUAL_VIEW_EXTRA_HEIGHT;
  return { width, height };
}

/**
 * Calculate dimensions for a bayed rack group.
 * BayedRackView renders front row above rear row (stacked), not side-by-side.
 *
 * Width = U-labels (32px) + (bay_width × num_bays)
 * Height = base overhead + (maxHeight × 44) + optional group name
 */
function getBayedGroupDimensions(
  group: RackGroup,
  racks: Rack[],
): { width: number; height: number } {
  if (racks.length === 0) return { width: 0, height: 0 };

  const maxHeight = Math.max(...racks.map((r) => r.height));
  // All racks in a bayed group have the same width
  const rackWidthInches = racks[0].width;
  const bayWidthPx = Math.round((BASE_RACK_WIDTH * rackWidthInches) / 19);

  // Width: U-labels + all bays (bays touch with no gap)
  const width = U_LABELS_WIDTH + bayWidthPx * racks.length;

  // Height: front row + rear row + overhead
  // Each row has height = 38 + (H × 22), so total rack area = 2 × that = 76 + H×44
  // Plus labels, padding, gaps = 172 + (name ? 24 : 0)
  const hasName = !!group.name;
  const height =
    BAYED_GROUP_HEIGHT_BASE +
    (hasName ? BAYED_GROUP_NAME_HEIGHT : 0) +
    maxHeight * 44;

  return { width, height };
}

/**
 * Convert racks and groups to RackPosition array for bounding box calculation.
 * Handles both bayed rack groups (stacked front/rear) and ungrouped racks (dual-view).
 * Includes selection highlight padding in all dimensions.
 *
 * @param racks - Array of racks from the layout store
 * @param rackGroups - Array of rack groups (optional, for bayed rack handling)
 * @returns Array of RackPosition objects with calculated coordinates
 */
export function racksToPositions(
  racks: Rack[],
  rackGroups: RackGroup[] = [],
): RackPosition[] {
  if (racks.length === 0) return [];

  // Separate racks into bayed groups and ungrouped
  const bayedGroups = rackGroups.filter((g) => g.layout_preset === "bayed");
  const bayedRackIds = new Set(bayedGroups.flatMap((g) => g.rack_ids));
  const ungroupedRacks = racks.filter((r) => !bayedRackIds.has(r.id));

  // Build list of visual elements to position (each gets one RackPosition)
  interface VisualElement {
    type: "bayed" | "ungrouped";
    width: number;
    height: number;
    position: number; // For sorting (use first rack's position for groups)
  }

  const elements: VisualElement[] = [];

  // Add bayed groups
  for (const group of bayedGroups) {
    const groupRacks = group.rack_ids
      .map((id) => racks.find((r) => r.id === id))
      .filter((r): r is Rack => r !== undefined);

    if (groupRacks.length === 0) continue;

    const { width, height } = getBayedGroupDimensions(group, groupRacks);
    // Use minimum position of any rack in group for sorting
    const position = Math.min(...groupRacks.map((r) => r.position));

    elements.push({
      type: "bayed",
      width: width + SELECTION_HIGHLIGHT_PADDING * 2,
      height: height + SELECTION_HIGHLIGHT_PADDING * 2,
      position,
    });
  }

  // Add ungrouped racks
  for (const rack of ungroupedRacks) {
    const { width, height } = getDualViewDimensions(rack);
    elements.push({
      type: "ungrouped",
      width: width + SELECTION_HIGHLIGHT_PADDING * 2,
      height: height + SELECTION_HIGHLIGHT_PADDING * 2,
      position: rack.position,
    });
  }

  // Sort by position
  elements.sort((a, b) => a.position - b.position);

  // Find max height for vertical alignment
  const maxHeight = Math.max(...elements.map((e) => e.height), 0);

  // Position elements horizontally
  let currentX = RACK_ROW_PADDING;
  const startY = RACK_ROW_PADDING;

  return elements.map((element) => {
    const position: RackPosition = {
      x: currentX,
      y: startY + (maxHeight - element.height),
      width: element.width,
      height: element.height,
    };
    currentX += element.width + RACK_GAP;
    return position;
  });
}
