import { describe, it, expect } from "vitest";
import {
  UNITS_PER_U,
  toInternalUnits,
  toHumanUnits,
  heightToInternalUnits,
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
});
