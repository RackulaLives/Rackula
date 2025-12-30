/**
 * MikroTik Brand Pack Tests
 */

import { describe, it, expect } from "vitest";
import { mikrotikDevices } from "$lib/data/brandPacks/mikrotik";

describe("MikroTik Brand Pack", () => {
  describe("Device Count", () => {
    it("exports correct number of devices", () => {
      expect(mikrotikDevices).toHaveLength(57);
    });
  });

  describe("Common Properties", () => {
    it("all devices have manufacturer set to MikroTik", () => {
      for (const device of mikrotikDevices) {
        expect(device.manufacturer).toBe("MikroTik");
      }
    });

    it("all devices have valid slugs", () => {
      for (const device of mikrotikDevices) {
        expect(device.slug).toBeDefined();
        // Slugs should be lowercase and may have hyphens and numbers
        expect(device.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all devices have valid u_height", () => {
      for (const device of mikrotikDevices) {
        expect(device.u_height).toBeGreaterThanOrEqual(1);
        expect(device.u_height).toBeLessThanOrEqual(4);
      }
    });

    it("all devices have network category", () => {
      for (const device of mikrotikDevices) {
        // Schema v1.0.0: Flat structure with category at top level
        expect(device.category).toBe("network");
      }
    });
  });

  describe("Specific Devices", () => {
    it("includes CRS326-24G-2S+ with correct properties", () => {
      const crs326 = mikrotikDevices.find((d) => d.model === "CRS326-24G-2S+");
      expect(crs326).toBeDefined();
      expect(crs326?.slug).toBe("crs326-24g-2s-plus");
      expect(crs326?.u_height).toBe(1);
      expect(crs326?.is_full_depth).toBe(false);
    });

    it("includes CCR2004-1G-12S+2XS with correct properties", () => {
      const ccr2004 = mikrotikDevices.find(
        (d) => d.model === "CCR2004-1G-12S+2XS",
      );
      expect(ccr2004).toBeDefined();
      expect(ccr2004?.slug).toBe("ccr2004-1g-12s-plus-2xs");
      expect(ccr2004?.u_height).toBe(1);
      expect(ccr2004?.is_full_depth).toBe(false);
    });

    it("handles special characters in model names correctly", () => {
      // Model names with + should have slugs with '-plus'
      const devicesWithPlus = mikrotikDevices.filter((d) =>
        d.model?.includes("+"),
      );
      for (const device of devicesWithPlus) {
        expect(device.slug).toContain("plus");
        expect(device.slug).not.toContain("+");
      }
    });
  });

  describe("Slug Uniqueness", () => {
    it("all slugs are unique", () => {
      const slugs = mikrotikDevices.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });
});
