/**
 * Rack layout scaling helpers (#2736).
 *
 * The drawn rack frame scales horizontally with the nominal inch width while the
 * U-grid (row height) stays identical across widths. These pure helpers are the
 * single source of truth for that mapping, so the scaling math is unit-tested
 * here rather than through the rendered SVG.
 */
import { describe, it, expect } from "vitest";
import {
  getRackWidth,
  getInteriorWidth,
  getTotalHeight,
  BASE_RACK_WIDTH,
  RAIL_WIDTH,
  U_HEIGHT_PX,
} from "./layout";

const NOMINAL_WIDTHS = [10, 19, 21, 23] as const;

describe("getRackWidth", () => {
  it("draws the unscaled base width at the 19 inch reference", () => {
    expect(getRackWidth(19)).toBe(BASE_RACK_WIDTH);
  });

  it("scales monotonically with the nominal inch width", () => {
    const widths = NOMINAL_WIDTHS.map(getRackWidth);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    }
  });

  it("scales proportionally to the inch width (10 narrowest, 23 widest)", () => {
    // The drawn width is proportional to the inch width: each width's drawn px
    // matches its share of the 19 inch base, within sub-pixel rounding.
    for (const width of NOMINAL_WIDTHS) {
      const expected = (getRackWidth(19) * width) / 19;
      expect(Math.abs(getRackWidth(width) - expected)).toBeLessThanOrEqual(1);
    }
  });
});

describe("getInteriorWidth", () => {
  it("insets the rail width from both sides of the drawn width", () => {
    for (const width of NOMINAL_WIDTHS) {
      const drawn = getRackWidth(width);
      expect(getInteriorWidth(drawn)).toBe(drawn - RAIL_WIDTH * 2);
    }
  });
});

describe("getTotalHeight (U-grid is identical across widths)", () => {
  it("depends only on the U count, never on the rack width", () => {
    // The vertical U metric is width-independent: one U is always U_HEIGHT_PX,
    // so the U-grid row height does not change as the frame scales horizontally.
    expect(getTotalHeight(1)).toBe(U_HEIGHT_PX);
    expect(getTotalHeight(42)).toBe(42 * U_HEIGHT_PX);
  });
});
