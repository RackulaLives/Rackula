import { describe, it, expect } from "vitest";
import {
  UNITS_PER_U,
  toInternalUnits,
  toHumanUnits,
  heightToInternalUnits,
  formatDisplayPosition,
} from "$lib/utils/position";

describe("Position Conversion Utilities", () => {
  describe("UNITS_PER_U constant", () => {
    it("equals 6 (LCM of 2 and 3 for 1/2U and 1/3U support)", () => {
      expect(UNITS_PER_U).toBe(6);
    });
  });

  describe("toInternalUnits", () => {
    it("converts whole U positions correctly", () => {
      expect(toInternalUnits(1)).toBe(6);
      expect(toInternalUnits(2)).toBe(12);
      expect(toInternalUnits(42)).toBe(252);
    });

    it("converts 1/2U positions correctly", () => {
      expect(toInternalUnits(0.5)).toBe(3);
      expect(toInternalUnits(1.5)).toBe(9);
      expect(toInternalUnits(2.5)).toBe(15);
    });

    it("converts 1/3U positions correctly", () => {
      // 1/3 = 0.333...
      expect(toInternalUnits(1 / 3)).toBe(2);
      expect(toInternalUnits(1 + 1 / 3)).toBe(8);
      expect(toInternalUnits(2 / 3)).toBe(4);
    });

    it("converts 1/6U positions correctly", () => {
      // 1/6 = 0.166...
      expect(toInternalUnits(1 / 6)).toBe(1);
      expect(toInternalUnits(5 / 6)).toBe(5);
    });
  });

  describe("toHumanUnits", () => {
    it("converts internal units to whole U correctly", () => {
      expect(toHumanUnits(6)).toBe(1);
      expect(toHumanUnits(12)).toBe(2);
      expect(toHumanUnits(252)).toBe(42);
    });

    it("converts internal units to fractional U correctly", () => {
      expect(toHumanUnits(3)).toBe(0.5);
      expect(toHumanUnits(9)).toBe(1.5);
      expect(toHumanUnits(4)).toBeCloseTo(2 / 3);
    });
  });

  describe("round-trip conversion", () => {
    it("preserves whole U values", () => {
      expect(toHumanUnits(toInternalUnits(1))).toBe(1);
      expect(toHumanUnits(toInternalUnits(10))).toBe(10);
      expect(toHumanUnits(toInternalUnits(42))).toBe(42);
    });

    it("preserves 1/2U values", () => {
      expect(toHumanUnits(toInternalUnits(0.5))).toBe(0.5);
      expect(toHumanUnits(toInternalUnits(1.5))).toBe(1.5);
      expect(toHumanUnits(toInternalUnits(2.5))).toBe(2.5);
    });

    it("preserves 1/3U values", () => {
      expect(toHumanUnits(toInternalUnits(1 / 3))).toBeCloseTo(1 / 3);
      expect(toHumanUnits(toInternalUnits(2 / 3))).toBeCloseTo(2 / 3);
    });

    it("preserves 1/6U values", () => {
      expect(toHumanUnits(toInternalUnits(1 / 6))).toBeCloseTo(1 / 6);
      expect(toHumanUnits(toInternalUnits(5 / 6))).toBeCloseTo(5 / 6);
    });
  });

  describe("heightToInternalUnits", () => {
    it("converts device heights to internal units", () => {
      expect(heightToInternalUnits(1)).toBe(6);
      expect(heightToInternalUnits(2)).toBe(12);
      expect(heightToInternalUnits(4)).toBe(24);
    });

    it("converts 1/2U device heights correctly", () => {
      expect(heightToInternalUnits(0.5)).toBe(3);
      expect(heightToInternalUnits(1.5)).toBe(9);
    });
  });

  describe("formatDisplayPosition", () => {
    // Independent cross-check against Rack.svelte's own ruler formula
    // (uLabels, Rack.svelte ~L243-252), NOT a copy of position.ts's
    // implementation: row index i counts down from the top (i=0), while
    // position.ts's `position` is always measured from the physical
    // bottom of the rack (SPEC: collision.ts's yToInternalPosition,
    // "U=1 at bottom"). So humanU (bottom-up) = position / UNITS_PER_U,
    // and the row index from the top is i = height - humanU. The ruler
    // then labels that row `startUnit + i` (descending) or
    // `startUnit + (height - 1) - i` (ascending). If formatDisplayPosition
    // diverges from this, the announced/edit-panel U no longer matches
    // what's drawn on the ruler.
    function rulerLabel(
      position: number,
      height: number,
      descUnits: boolean,
      startingUnit: number,
    ): string {
      const humanU = position / UNITS_PER_U;
      const i = height - humanU;
      const uNumber = descUnits
        ? startingUnit + i
        : startingUnit + (height - 1) - i;
      return `U${uNumber}`;
    }

    const height = 42;
    // Physical rail positions (internal units) for U1 (bottom), U17, and U42 (top).
    const bottomPosition = toInternalUnits(1);
    const midPosition = toInternalUnits(17);
    const topPosition = toInternalUnits(height);

    it("matches the ruler for an ascending rack starting at U1 (default)", () => {
      for (const position of [bottomPosition, midPosition, topPosition]) {
        expect(formatDisplayPosition(position, height, false, 1)).toBe(
          rulerLabel(position, height, false, 1),
        );
      }
      // Matches the documented example: bottom rail position labels U1.
      expect(formatDisplayPosition(bottomPosition, height, false, 1)).toBe(
        "U1",
      );
    });

    it("matches the ruler for a descending rack starting at U1 (default)", () => {
      for (const position of [bottomPosition, midPosition, topPosition]) {
        expect(formatDisplayPosition(position, height, true, 1)).toBe(
          rulerLabel(position, height, true, 1),
        );
      }
      // Matches the documented example: bottom rail position labels U42
      // when desc_units flips U1 to the top.
      expect(formatDisplayPosition(bottomPosition, height, true, 1)).toBe(
        "U42",
      );
    });

    it("matches the ruler for an ascending rack with an offset starting_unit", () => {
      const startingUnit = 25;
      for (const position of [bottomPosition, midPosition, topPosition]) {
        expect(
          formatDisplayPosition(position, height, false, startingUnit),
        ).toBe(rulerLabel(position, height, false, startingUnit));
      }
      // The bottom rail position is the rack's first physical U, so it
      // carries the starting_unit label directly.
      expect(
        formatDisplayPosition(bottomPosition, height, false, startingUnit),
      ).toBe("U25");
    });

    it("matches the ruler for a descending rack with an offset starting_unit", () => {
      const startingUnit = 25;
      for (const position of [bottomPosition, midPosition, topPosition]) {
        expect(
          formatDisplayPosition(position, height, true, startingUnit),
        ).toBe(rulerLabel(position, height, true, startingUnit));
      }
      // The top rail position is row i=0, so it carries the starting_unit
      // label directly when descending.
      expect(
        formatDisplayPosition(topPosition, height, true, startingUnit),
      ).toBe("U25");
    });

    it("defaults starting_unit to 1 when omitted, preserving prior callers", () => {
      expect(formatDisplayPosition(bottomPosition, height, false)).toBe(
        formatDisplayPosition(bottomPosition, height, false, 1),
      );
      expect(formatDisplayPosition(bottomPosition, height, true)).toBe(
        formatDisplayPosition(bottomPosition, height, true, 1),
      );
    });
  });
});
