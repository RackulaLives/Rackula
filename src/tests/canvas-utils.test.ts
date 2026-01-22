/**
 * Canvas Utility Tests
 *
 * Tests for fit-all calculations and rack positioning.
 * These are coordinate math functions that benefit from unit testing.
 */

import { describe, it, expect } from "vitest";
import {
  calculateRacksBoundingBox,
  racksToPositions,
  calculateFitAll,
} from "$lib/utils/canvas";
import { createTestRack } from "./factories";
import {
  U_HEIGHT_PX,
  BASE_RACK_WIDTH,
  RAIL_WIDTH,
  BASE_RACK_PADDING,
  RACK_PADDING_HIDDEN,
  NAME_Y_OFFSET,
  DUAL_VIEW_GAP,
  DUAL_VIEW_EXTRA_HEIGHT,
  SELECTION_HIGHLIGHT_PADDING,
  RACK_ROW_PADDING,
} from "$lib/constants/layout";

describe("Canvas Utils", () => {
  describe("calculateRacksBoundingBox", () => {
    it("returns zero bounds for empty array", () => {
      const bounds = calculateRacksBoundingBox([]);
      expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("calculates bounding box for single rack position", () => {
      const positions = [{ x: 10, y: 20, width: 100, height: 200 }];
      const bounds = calculateRacksBoundingBox(positions);

      expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    });

    it("calculates bounding box for multiple rack positions", () => {
      const positions = [
        { x: 0, y: 0, width: 100, height: 200 },
        { x: 120, y: 50, width: 100, height: 150 },
      ];
      const bounds = calculateRacksBoundingBox(positions);

      expect(bounds).toEqual({ x: 0, y: 0, width: 220, height: 200 });
    });
  });

  describe("racksToPositions", () => {
    it("returns empty array for no racks", () => {
      const positions = racksToPositions([]);
      expect(positions).toEqual([]);
    });

    it("calculates position for single ungrouped rack", () => {
      const rack = createTestRack({ height: 42, width: 19 });
      const positions = racksToPositions([rack]);

      // eslint-disable-next-line no-restricted-syntax -- one rack input should produce exactly one position output
      expect(positions).toHaveLength(1);

      // The width should be: 2 * rackWidthPx + DUAL_VIEW_GAP + SELECTION_HIGHLIGHT_PADDING * 2
      const expectedRackWidthPx = Math.round((BASE_RACK_WIDTH * 19) / 19);
      const expectedWidth =
        expectedRackWidthPx * 2 +
        DUAL_VIEW_GAP +
        SELECTION_HIGHLIGHT_PADDING * 2;
      expect(positions[0].width).toBe(expectedWidth);

      // The height calculation should account for actual rendered dimensions
      expect(positions[0].height).toBeGreaterThan(0);
    });

    it("includes selection highlight padding in dimensions", () => {
      const rack = createTestRack({ height: 42, width: 19 });
      const positions = racksToPositions([rack]);

      // Width should include 2 * SELECTION_HIGHLIGHT_PADDING
      const rackWidthPx = Math.round((BASE_RACK_WIDTH * 19) / 19);
      const baseWidth = rackWidthPx * 2 + DUAL_VIEW_GAP;
      expect(positions[0].width).toBe(
        baseWidth + SELECTION_HIGHLIGHT_PADDING * 2,
      );

      // Height should include 2 * SELECTION_HIGHLIGHT_PADDING
      // In dual-view mode, hideRackName=true so RACK_PADDING_HIDDEN is used
      const baseHeight =
        RACK_PADDING_HIDDEN +
        RAIL_WIDTH * 2 +
        42 * U_HEIGHT_PX +
        DUAL_VIEW_EXTRA_HEIGHT;
      expect(positions[0].height).toBe(
        baseHeight + SELECTION_HIGHLIGHT_PADDING * 2,
      );
    });
  });

  describe("calculateFitAll", () => {
    it("returns defaults for empty rack array", () => {
      const result = calculateFitAll([], 800, 600);
      expect(result).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it("calculates zoom and pan to fit racks in viewport", () => {
      const positions = [{ x: 0, y: 0, width: 500, height: 1000 }];
      const result = calculateFitAll(positions, 800, 600);

      // Zoom should be less than 1 since content is larger than viewport
      expect(result.zoom).toBeLessThan(1);
      expect(result.zoom).toBeGreaterThan(0);
    });
  });

  describe("48U rack height calculation", () => {
    /**
     * This test verifies that the bounding box calculation for 48U racks
     * correctly accounts for all visual elements.
     *
     * The rendered height of a RackDualView for a 48U rack includes:
     * 1. The Rack SVG height (when hideRackName=true):
     *    - RACK_PADDING_HIDDEN (4px)
     *    - RAIL_WIDTH * 2 (34px)
     *    - rack.height * U_HEIGHT_PX (1056px for 48U)
     *    - NAME_Y_OFFSET (4px for overflow)
     *    = 1098px
     *
     * 2. RackDualView wrapper overhead (DUAL_VIEW_EXTRA_HEIGHT = 64px):
     *    - padding-top (12px)
     *    - gap (8px)
     *    - rack name height (~24px with line-height)
     *    - rack name margin-bottom (4px)
     *    - padding-bottom (12px)
     *    + 4px buffer for browser rendering = 64px
     *
     * The getDualViewDimensions function should return a height that
     * matches or exceeds the actual rendered height to prevent cutoff.
     */
    it("48U rack bounding box should be large enough to include all content", () => {
      const rack = createTestRack({ height: 48, width: 19 });
      const positions = racksToPositions([rack]);

      // eslint-disable-next-line no-restricted-syntax -- one rack input should produce exactly one position output
      expect(positions).toHaveLength(1);

      // Calculate expected height from the formula in getDualViewDimensions
      // In dual-view mode, hideRackName=true so RACK_PADDING_HIDDEN is used
      const formulaHeight =
        RACK_PADDING_HIDDEN +
        RAIL_WIDTH * 2 +
        48 * U_HEIGHT_PX +
        DUAL_VIEW_EXTRA_HEIGHT +
        SELECTION_HIGHLIGHT_PADDING * 2;

      // Calculate actual SVG height (what Rack.svelte renders with hideRackName=true)
      const actualSvgHeight =
        RACK_PADDING_HIDDEN + RAIL_WIDTH * 2 + 48 * U_HEIGHT_PX + NAME_Y_OFFSET;

      // Wrapper overhead from RackDualView CSS
      // padding (12+12) + gap (8) + name (~24) + margin (4) = ~60px
      // DUAL_VIEW_EXTRA_HEIGHT = 64 includes 4px buffer for browser rendering
      const estimatedWrapperOverhead = 64;

      const actualRenderedHeight = actualSvgHeight + estimatedWrapperOverhead;

      // The bounding box height (positions[0].height) should be >= actual rendered height
      // to ensure the content fits without cutoff
      expect(positions[0].height).toBe(formulaHeight);

      // The formula should produce a height that's >= the actual rendered height
      // If this fails, we need to increase DUAL_VIEW_EXTRA_HEIGHT
      expect(positions[0].height).toBeGreaterThanOrEqual(actualRenderedHeight);
    });

    it("48U rack fit-all should not cut off the bottom", () => {
      const rack = createTestRack({ height: 48, width: 19 });

      // Simulate a viewport that's smaller than the rack
      const viewportWidth = 800;
      const viewportHeight = 600;

      const positions = racksToPositions([rack]);
      const { zoom } = calculateFitAll(
        positions,
        viewportWidth,
        viewportHeight,
      );

      // After fitting, the scaled content should fit within the viewport
      const bounds = calculateRacksBoundingBox(positions);
      const scaledWidth =
        (bounds.width + RACK_ROW_PADDING * 2) * zoom + 2 * RACK_ROW_PADDING;
      const scaledHeight =
        (bounds.height + RACK_ROW_PADDING * 2) * zoom + 2 * RACK_ROW_PADDING;

      // Content should fit within viewport (with some margin for rounding)
      expect(scaledWidth).toBeLessThanOrEqual(viewportWidth + 1);
      expect(scaledHeight).toBeLessThanOrEqual(viewportHeight + 1);
    });
  });
});
