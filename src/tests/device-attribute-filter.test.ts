/**
 * Device Attribute Filter Tests
 *
 * Tests for the pure attribute-filter predicate that powers the device palette
 * filter UI (height bucket, half/full width, has-image, custom-only).
 * Custom detection is injected so the predicate stays pure and testable.
 */

import { describe, it, expect } from "vitest";
import {
  filterDevicesByAttributes,
  type DeviceAttributeFilters,
  type HeightBucket,
} from "$lib/utils/deviceFilters";
import type { DeviceType } from "$lib/types";
import { createTestDeviceType } from "./factories";

/** Build a filters object, defaulting to the no-op empty state. */
function makeFilters(
  overrides: Partial<DeviceAttributeFilters> = {},
): DeviceAttributeFilters {
  return {
    heights: new Set<HeightBucket>(),
    halfWidth: false,
    fullWidth: false,
    hasImage: false,
    customOnly: false,
    ...overrides,
  };
}

/** No device is custom. */
const noneCustom = (): boolean => false;

describe("filterDevicesByAttributes", () => {
  describe("empty filters", () => {
    it("returns the input unchanged when no filters are active", () => {
      const devices = [
        createTestDeviceType({ slug: "a", u_height: 1 }),
        createTestDeviceType({ slug: "b", u_height: 2 }),
      ];

      const result = filterDevicesByAttributes(
        devices,
        makeFilters(),
        noneCustom,
      );

      expect(result).toBe(devices);
    });
  });

  describe("height buckets", () => {
    const sub1 = createTestDeviceType({ slug: "sub-1u", u_height: 0.5 });
    const one = createTestDeviceType({ slug: "one-u", u_height: 1 });
    const two = createTestDeviceType({ slug: "two-u", u_height: 2 });
    const three = createTestDeviceType({ slug: "three-u", u_height: 3 });
    const four = createTestDeviceType({ slug: "four-u", u_height: 4 });
    const six = createTestDeviceType({ slug: "six-u", u_height: 6 });
    const devices = [sub1, one, two, three, four, six];

    it("0.5 bucket matches only sub-1U devices", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ heights: new Set<HeightBucket>(["0.5"]) }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("sub-1u");
      expect(slugs).not.toContain("one-u");
      expect(slugs).not.toContain("two-u");
    });

    it("a numeric bucket matches only the exact U height", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ heights: new Set<HeightBucket>(["2"]) }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("two-u");
      expect(slugs).not.toContain("sub-1u");
      expect(slugs).not.toContain("one-u");
      expect(slugs).not.toContain("three-u");
    });

    it("4plus bucket matches 4U and taller", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ heights: new Set<HeightBucket>(["4plus"]) }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("four-u");
      expect(slugs).toContain("six-u");
      expect(slugs).not.toContain("three-u");
      expect(slugs).not.toContain("sub-1u");
    });

    it("multiple buckets OR within the height group", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ heights: new Set<HeightBucket>(["1", "4plus"]) }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("one-u");
      expect(slugs).toContain("four-u");
      expect(slugs).toContain("six-u");
      expect(slugs).not.toContain("two-u");
      expect(slugs).not.toContain("three-u");
      expect(slugs).not.toContain("sub-1u");
    });
  });

  describe("width", () => {
    const half = createTestDeviceType({ slug: "half", slot_width: 1 });
    const full = createTestDeviceType({ slug: "full", slot_width: 2 });
    // slot_width undefined defaults to full-width.
    const defaultFull = createTestDeviceType({ slug: "default-full" });
    const devices = [half, full, defaultFull];

    it("half-only keeps only slot_width === 1", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ halfWidth: true }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("half");
      expect(slugs).not.toContain("full");
      expect(slugs).not.toContain("default-full");
    });

    it("full-only keeps slot_width === 2 and undefined (default full)", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ fullWidth: true }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("full");
      expect(slugs).toContain("default-full");
      expect(slugs).not.toContain("half");
    });

    it("half + full selected behaves as no width filter", () => {
      const result = filterDevicesByAttributes(
        devices,
        makeFilters({ halfWidth: true, fullWidth: true }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("half");
      expect(slugs).toContain("full");
      expect(slugs).toContain("default-full");
    });
  });

  describe("has-image", () => {
    it("keeps devices with a front or rear image flag", () => {
      const noImage = createTestDeviceType({ slug: "no-image" });
      const frontOnly: DeviceType = {
        ...createTestDeviceType({ slug: "front-only" }),
        front_image: true,
      };
      const rearOnly: DeviceType = {
        ...createTestDeviceType({ slug: "rear-only" }),
        rear_image: true,
      };

      const result = filterDevicesByAttributes(
        [noImage, frontOnly, rearOnly],
        makeFilters({ hasImage: true }),
        noneCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("front-only");
      expect(slugs).toContain("rear-only");
      expect(slugs).not.toContain("no-image");
    });
  });

  describe("custom-only", () => {
    it("keeps only devices the injected isCustom marks as custom", () => {
      const builtIn = createTestDeviceType({ slug: "built-in" });
      const custom = createTestDeviceType({ slug: "my-custom" });

      const isCustom = (slug: string): boolean => slug === "my-custom";

      const result = filterDevicesByAttributes(
        [builtIn, custom],
        makeFilters({ customOnly: true }),
        isCustom,
      );
      const slugs = result.map((d) => d.slug);

      expect(slugs).toContain("my-custom");
      expect(slugs).not.toContain("built-in");
    });
  });

  describe("AND across groups", () => {
    it("combines height and custom filters with AND", () => {
      const customTwoU = createTestDeviceType({
        slug: "custom-2u",
        u_height: 2,
      });
      const customOneU = createTestDeviceType({
        slug: "custom-1u",
        u_height: 1,
      });
      const builtInTwoU = createTestDeviceType({
        slug: "builtin-2u",
        u_height: 2,
      });

      const isCustom = (slug: string): boolean => slug.startsWith("custom-");

      const result = filterDevicesByAttributes(
        [customTwoU, customOneU, builtInTwoU],
        makeFilters({
          heights: new Set<HeightBucket>(["2"]),
          customOnly: true,
        }),
        isCustom,
      );
      const slugs = result.map((d) => d.slug);

      // Only the device that is both 2U AND custom survives.
      expect(slugs).toContain("custom-2u");
      expect(slugs).not.toContain("custom-1u"); // wrong height
      expect(slugs).not.toContain("builtin-2u"); // not custom
    });
  });
});
