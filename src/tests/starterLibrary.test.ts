import { describe, it, expect } from "vitest";
import { getStarterLibrary } from "$lib/data/starterLibrary";
import { createLayout } from "$lib/utils/serialization";
import { DeviceTypeSchema } from "$lib/schemas";

/**
 * Starter Device Library Tests
 *
 * These tests verify INVARIANTS about the starter library, not individual devices.
 * Individual device properties are validated by DeviceTypeSchema.
 *
 * What we test:
 * - Unique slugs (catches duplicate entries)
 * - All categories represented (catches missing category coverage)
 * - Business rules (starter library = generic devices only)
 * - Schema compliance (all devices pass schema validation)
 *
 * What we DON'T test:
 * - Exact device counts (breaks on intentional additions)
 * - Individual device existence (static data, no value)
 * - Property values already validated by schema
 *
 * See: docs/guides/TESTING.md - "Zero-Change Rule"
 */
describe("Starter Device Type Library", () => {
  describe("Schema Validation", () => {
    it("all devices pass DeviceTypeSchema validation", () => {
      const deviceTypes = getStarterLibrary();

      for (const device of deviceTypes) {
        expect(() => DeviceTypeSchema.parse(device)).not.toThrow();
      }
    });
  });

  describe("Invariants", () => {
    it("device type slugs are unique", () => {
      const deviceTypes = getStarterLibrary();
      const slugs = deviceTypes.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);

      expect(uniqueSlugs.size).toBe(slugs.length);
    });

    it("all categories have at least one starter device type", () => {
      const deviceTypes = getStarterLibrary();
      const categoriesWithDevices = new Set(deviceTypes.map((d) => d.category));

      // Core categories should all be represented
      expect(categoriesWithDevices.has("server")).toBe(true);
      expect(categoriesWithDevices.has("network")).toBe(true);
      expect(categoriesWithDevices.has("storage")).toBe(true);
      expect(categoriesWithDevices.has("power")).toBe(true);
      expect(categoriesWithDevices.has("patch-panel")).toBe(true);
      expect(categoriesWithDevices.has("kvm")).toBe(true);
      expect(categoriesWithDevices.has("av-media")).toBe(true);
      expect(categoriesWithDevices.has("cooling")).toBe(true);
      expect(categoriesWithDevices.has("shelf")).toBe(true);
      expect(categoriesWithDevices.has("blank")).toBe(true);
      expect(categoriesWithDevices.has("cable-management")).toBe(true);
    });

    it("no devices have manufacturer (all generic)", () => {
      const deviceTypes = getStarterLibrary();

      deviceTypes.forEach((deviceType) => {
        expect(deviceType.manufacturer).toBeUndefined();
      });
    });

    it("half-width devices are half-depth", () => {
      const deviceTypes = getStarterLibrary();
      const halfWidthDevices = deviceTypes.filter((d) => d.slot_width === 1);

      // Must have some half-width devices
      expect(halfWidthDevices.length).toBeGreaterThan(0);

      // All half-width should be half-depth
      halfWidthDevices.forEach((device) => {
        expect(device.is_full_depth).toBe(false);
      });
    });
  });

  describe("Layout Integration", () => {
    it("new layout has empty device_types (starter library is runtime constant)", () => {
      const layout = createLayout();

      // device_types starts empty - starter library is a runtime constant
      expect(layout.device_types.length).toBe(0);
    });

    it("starter library is non-empty", () => {
      const starterLibrary = getStarterLibrary();
      expect(starterLibrary.length).toBeGreaterThan(0);
    });
  });
});
