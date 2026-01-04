import { describe, it, expect } from "vitest";
import type { DeviceCategory } from "$lib/types";
import {
  CATEGORY_COLOURS,
  ALL_CATEGORIES,
  CURRENT_VERSION,
  DEFAULT_RACK_VIEW,
  DEFAULT_DEVICE_FACE,
  MIN_DEVICE_HEIGHT,
  SUPPORTED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_MB,
  MAX_IMAGE_SIZE_BYTES,
} from "$lib/types/constants";

/**
 * Constants Tests
 *
 * These tests verify the completeness and correctness of type system constants.
 * TypeScript interface tests are intentionally NOT included here because:
 * - TypeScript validates interface compliance at compile time
 * - Runtime tests that just prove TS works add no value
 *
 * See: docs/guides/TESTING.md - "Trust the Schema" principle
 */
describe("Constants", () => {
  describe("CATEGORY_COLOURS", () => {
    it("has entry for every DeviceCategory", () => {
      const categories: DeviceCategory[] = [
        "server",
        "network",
        "patch-panel",
        "power",
        "storage",
        "kvm",
        "av-media",
        "cooling",
        "shelf",
        "blank",
        "cable-management",
        "other",
      ];

      categories.forEach((category) => {
        expect(CATEGORY_COLOURS[category]).toBeDefined();
        expect(CATEGORY_COLOURS[category]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe("ALL_CATEGORIES", () => {
    it("contains all 12 categories", () => {
      expect(ALL_CATEGORIES).toHaveLength(12);
    });

    it("includes all expected categories", () => {
      const expectedCategories: DeviceCategory[] = [
        "server",
        "network",
        "patch-panel",
        "power",
        "storage",
        "kvm",
        "av-media",
        "cooling",
        "shelf",
        "blank",
        "cable-management",
        "other",
      ];

      expectedCategories.forEach((category) => {
        expect(ALL_CATEGORIES).toContain(category);
      });
    });
  });

  describe("Version and Defaults", () => {
    it("CURRENT_VERSION is 1.0.0 (stable schema)", () => {
      expect(CURRENT_VERSION).toBe("1.0.0");
    });

    it("DEFAULT_RACK_VIEW is front", () => {
      expect(DEFAULT_RACK_VIEW).toBe("front");
    });

    it("DEFAULT_DEVICE_FACE is front", () => {
      expect(DEFAULT_DEVICE_FACE).toBe("front");
    });

    it("MIN_DEVICE_HEIGHT supports half-U devices", () => {
      expect(MIN_DEVICE_HEIGHT).toBe(0.5);
    });
  });

  describe("Image Format Constants", () => {
    it("SUPPORTED_IMAGE_FORMATS includes png, jpeg, and webp", () => {
      expect(SUPPORTED_IMAGE_FORMATS).toContain("image/png");
      expect(SUPPORTED_IMAGE_FORMATS).toContain("image/jpeg");
      expect(SUPPORTED_IMAGE_FORMATS).toContain("image/webp");
      expect(SUPPORTED_IMAGE_FORMATS).toHaveLength(3);
    });

    it("does not support gif or bmp", () => {
      expect(SUPPORTED_IMAGE_FORMATS).not.toContain("image/gif");
      expect(SUPPORTED_IMAGE_FORMATS).not.toContain("image/bmp");
    });

    it("MAX_IMAGE_SIZE_MB is 5", () => {
      expect(MAX_IMAGE_SIZE_MB).toBe(5);
    });

    it("MAX_IMAGE_SIZE_BYTES equals 5MB", () => {
      expect(MAX_IMAGE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });
  });
});
