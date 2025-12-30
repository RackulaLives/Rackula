/**
 * Synology Brand Pack Tests
 */

import { describe, it, expect } from "vitest";
import { synologyDevices } from "$lib/data/brandPacks/synology";

describe("Synology Brand Pack", () => {
  describe("Device Count", () => {
    it("exports correct number of devices", () => {
      expect(synologyDevices).toHaveLength(33);
    });
  });

  describe("Common Properties", () => {
    it("all devices have manufacturer set to Synology", () => {
      for (const device of synologyDevices) {
        expect(device.manufacturer).toBe("Synology");
      }
    });

    it("all devices have valid slugs", () => {
      for (const device of synologyDevices) {
        expect(device.slug).toBeDefined();
        expect(device.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all devices have valid u_height (1-4U)", () => {
      for (const device of synologyDevices) {
        expect(device.u_height).toBeGreaterThanOrEqual(1);
        expect(device.u_height).toBeLessThanOrEqual(4);
      }
    });

    it("all devices have storage category", () => {
      for (const device of synologyDevices) {
        expect(device.category).toBe("storage");
      }
    });
  });

  describe("Specific Devices", () => {
    it("includes RS820+ with correct properties", () => {
      const rs820 = synologyDevices.find((d) => d.slug === "rs820-plus");
      expect(rs820).toBeDefined();
      expect(rs820?.model).toBe("RS820+");
      expect(rs820?.u_height).toBe(1);
      expect(rs820?.is_full_depth).toBe(true);
    });

    it("includes RS2421+ with correct properties", () => {
      const rs2421 = synologyDevices.find((d) => d.slug === "rs2421-plus");
      expect(rs2421).toBeDefined();
      expect(rs2421?.model).toBe("RS2421+");
      expect(rs2421?.u_height).toBe(2);
      expect(rs2421?.is_full_depth).toBe(true);
    });

    it("includes RS819 as half-depth device", () => {
      const rs819 = synologyDevices.find((d) => d.slug === "rs819");
      expect(rs819).toBeDefined();
      expect(rs819?.is_full_depth).toBe(false);
    });
  });

  describe("Slug Uniqueness", () => {
    it("all slugs are unique", () => {
      const slugs = synologyDevices.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });
});
