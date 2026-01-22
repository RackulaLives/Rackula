/**
 * Tests for fitAll calculation with multiple racks and show_rear toggle
 * Issue #907: Verifies that getDualViewDimensions correctly handles
 * single-view (show_rear: false) vs dual-view (show_rear: true) racks
 */
import { describe, it, expect } from "vitest";
import {
  calculateRacksBoundingBox,
  racksToPositions,
  calculateFitAll,
} from "$lib/utils/canvas";
import { createTestRack } from "./factories";
import {
  SELECTION_HIGHLIGHT_PADDING,
  BASE_RACK_WIDTH,
  DUAL_VIEW_GAP,
  FIT_ALL_MAX_ZOOM,
} from "$lib/constants/layout";

// Import zoom limits from canvas store (match the implementation)
const FIT_ALL_MIN_ZOOM = 0.25;

describe("fitAll with multiple racks", () => {
  it("calculates positions for two 42U racks", () => {
    const rack1 = createTestRack({ id: "rack-1", height: 42, width: 19 });
    const rack2 = createTestRack({
      id: "rack-2",
      height: 42,
      width: 19,
      position: 1,
    });

    const positions = racksToPositions([rack1, rack2]);

    // eslint-disable-next-line no-restricted-syntax -- two racks should produce two positions
    expect(positions).toHaveLength(2);

    // Both racks should have positions calculated
    expect(positions[0].x).toBeGreaterThan(0);
    expect(positions[1].x).toBeGreaterThan(positions[0].x);
  });

  it("calculates correct width for single-view rack (show_rear: false)", () => {
    const singleViewRack = createTestRack({
      id: "single-view-rack",
      height: 42,
      width: 19,
      show_rear: false,
    });
    const dualViewRack = createTestRack({
      id: "dual-view-rack",
      height: 42,
      width: 19,
      show_rear: true,
      position: 1,
    });

    const singlePositions = racksToPositions([singleViewRack]);
    const dualPositions = racksToPositions([dualViewRack]);

    // Single view width should be: rackWidth + 2 * SELECTION_HIGHLIGHT_PADDING
    const expectedSingleWidth =
      BASE_RACK_WIDTH + SELECTION_HIGHLIGHT_PADDING * 2;
    // Dual view width should be: 2 * rackWidth + gap + 2 * SELECTION_HIGHLIGHT_PADDING
    const expectedDualWidth =
      BASE_RACK_WIDTH * 2 + DUAL_VIEW_GAP + SELECTION_HIGHLIGHT_PADDING * 2;

    expect(singlePositions[0].width).toBe(expectedSingleWidth);
    expect(dualPositions[0].width).toBe(expectedDualWidth);

    // Single view should be narrower than dual view
    expect(singlePositions[0].width).toBeLessThan(dualPositions[0].width);
  });

  it("calculates correct bounding box for mixed single/dual view racks", () => {
    const singleViewRack = createTestRack({
      id: "mixed-single-rack",
      height: 42,
      width: 19,
      show_rear: false,
    });
    const dualViewRack = createTestRack({
      id: "mixed-dual-rack",
      height: 42,
      width: 19,
      show_rear: true,
      position: 1,
    });

    const positions = racksToPositions([singleViewRack, dualViewRack]);
    const bounds = calculateRacksBoundingBox(positions);

    // Both racks should be at same Y position (bottom-aligned)
    expect(positions[0].y).toBe(positions[1].y);

    // The dual-view rack should be positioned after the single-view rack
    expect(positions[1].x).toBeGreaterThan(positions[0].x);

    // Bounding box should encompass both racks
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it("fitAll result fits content in viewport", () => {
    const rack1 = createTestRack({ id: "fit-rack-1", height: 42, width: 19 });
    const rack2 = createTestRack({
      id: "fit-rack-2",
      height: 42,
      width: 19,
      position: 1,
    });

    const positions = racksToPositions([rack1, rack2]);
    const bounds = calculateRacksBoundingBox(positions);

    const viewportWidth = 1200;
    const viewportHeight = 800;

    const result = calculateFitAll(positions, viewportWidth, viewportHeight);

    // Zoom should be between min and max (using exported constants)
    expect(result.zoom).toBeGreaterThanOrEqual(FIT_ALL_MIN_ZOOM);
    expect(result.zoom).toBeLessThanOrEqual(FIT_ALL_MAX_ZOOM);

    // Pan values should be defined
    expect(typeof result.panX).toBe("number");
    expect(typeof result.panY).toBe("number");

    // Scaled content should fit in viewport
    // (bounds.width/height already represents the visual area that needs to fit)
    const scaledWidth = bounds.width * result.zoom;
    const scaledHeight = bounds.height * result.zoom;
    expect(scaledWidth).toBeLessThanOrEqual(viewportWidth);
    expect(scaledHeight).toBeLessThanOrEqual(viewportHeight);
  });
});
