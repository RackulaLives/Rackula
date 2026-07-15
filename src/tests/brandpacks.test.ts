/**
 * Brand Packs Consolidated Tests
 *
 * Tests all brand packs using parameterized tests.
 * Schema validation replaces manual property checks.
 *
 * Adding a new brand pack: Just add it to getBrandPacks() in the index file.
 * Adding a new device: No test changes required (schema validates).
 */

import { describe, it, expect } from "vitest";
import { getBrandPacks } from "$lib/data/brandPacks";
import { DeviceTypeSchema } from "$lib/schemas";

// Get all brand packs dynamically - no hardcoded list needed
const ALL_BRAND_PACKS = getBrandPacks();

describe("Brand Packs", () => {
  describe("Coverage", () => {
    it("has brand packs available", () => {
      expect(ALL_BRAND_PACKS.length).toBeGreaterThan(0);
    });

    it("all brand packs have devices", () => {
      for (const pack of ALL_BRAND_PACKS) {
        expect(pack.devices.length).toBeGreaterThan(0);
      }
    });
  });

  describe.each(ALL_BRAND_PACKS)("$title brand pack", ({ devices }) => {
    it("all devices validate against DeviceTypeSchema", () => {
      for (const device of devices) {
        expect(() => DeviceTypeSchema.parse(device)).not.toThrow();
      }
    });

    it("all devices have manufacturer set", () => {
      for (const device of devices) {
        expect(device.manufacturer).toBeDefined();
        expect(device.manufacturer).not.toBe("");
      }
    });

    it("no duplicate slugs within pack", () => {
      const slugs = devices.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });

    it("all slugs are valid format", () => {
      for (const device of devices) {
        expect(device.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });
  });
});

describe("Cross-Brand Validation", () => {
  it("no duplicate section ids across brand packs", () => {
    // Section id keys the palette's accordion (DevicePalette #each ... (section.id));
    // a collision throws a Svelte each_key_duplicate error at runtime.
    const ids = ALL_BRAND_PACKS.map((pack) => pack.id);
    const uniqueIds = new Set(ids);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("no duplicate titles across brand packs", () => {
    const titles = ALL_BRAND_PACKS.map((pack) => pack.title);
    const duplicates = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });

  it("no duplicate slugs across all brand packs", () => {
    const allSlugs: string[] = [];
    for (const pack of ALL_BRAND_PACKS) {
      for (const device of pack.devices) {
        allSlugs.push(device.slug);
      }
    }
    const uniqueSlugs = new Set(allSlugs);

    if (uniqueSlugs.size !== allSlugs.length) {
      // Find duplicates for better error message
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const slug of allSlugs) {
        if (seen.has(slug)) {
          duplicates.push(slug);
        }
        seen.add(slug);
      }
      expect(duplicates).toEqual([]);
    }

    expect(uniqueSlugs.size).toBe(allSlugs.length);
  });
});
