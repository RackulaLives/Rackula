/**
 * Dell Brand Pack Tests
 */

import { describe, it, expect } from "vitest";
import { dellDevices } from "$lib/data/brandPacks/dell";

describe("Dell Brand Pack", () => {
  describe("Device Count", () => {
    it("exports correct number of devices", () => {
      expect(dellDevices).toHaveLength(68);
    });
  });

  describe("Common Properties", () => {
    it("all devices have manufacturer set to Dell", () => {
      for (const device of dellDevices) {
        expect(device.manufacturer).toBe("Dell");
      }
    });

    it("all devices have valid slugs", () => {
      for (const device of dellDevices) {
        expect(device.slug).toBeDefined();
        expect(device.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all devices have valid u_height (1-10U for blade chassis)", () => {
      for (const device of dellDevices) {
        expect(device.u_height).toBeGreaterThanOrEqual(1);
        expect(device.u_height).toBeLessThanOrEqual(10);
      }
    });

    it("all devices have server category", () => {
      for (const device of dellDevices) {
        expect(device.category).toBe("server");
      }
    });

    it("all devices have is_full_depth defined or undefined (defaults to full depth)", () => {
      for (const device of dellDevices) {
        // is_full_depth may be true, false, or undefined (defaults to true in rendering)
        expect([true, false, undefined]).toContain(device.is_full_depth);
      }
    });
  });

  describe("Specific Devices", () => {
    it("includes PowerEdge R650 with correct properties", () => {
      const r650 = dellDevices.find((d) => d.slug === "poweredge-r650");
      expect(r650).toBeDefined();
      expect(r650?.model).toBe("PowerEdge R650");
      expect(r650?.u_height).toBe(1);
    });

    it("includes PowerEdge R750 with correct properties", () => {
      const r750 = dellDevices.find((d) => d.slug === "poweredge-r750");
      expect(r750).toBeDefined();
      expect(r750?.model).toBe("PowerEdge R750");
      expect(r750?.u_height).toBe(2);
    });

    it("includes legacy PowerEdge R720 with correct properties", () => {
      const r720 = dellDevices.find((d) => d.slug === "poweredge-r720");
      expect(r720).toBeDefined();
      expect(r720?.model).toBe("PowerEdge R720");
      expect(r720?.u_height).toBe(2);
    });
  });

  describe("Generation Coverage", () => {
    it("has 1U servers", () => {
      const oneU = dellDevices.filter((d) => d.u_height === 1);
      expect(oneU.length).toBeGreaterThan(0);
    });

    it("has 2U servers", () => {
      const twoU = dellDevices.filter((d) => d.u_height === 2);
      expect(twoU.length).toBeGreaterThan(0);
    });

    it("has high-density (xd) variants", () => {
      const xdModels = dellDevices.filter((d) => d.slug.includes("xd"));
      expect(xdModels.length).toBeGreaterThan(0);
    });
  });

  describe("Slug Uniqueness", () => {
    it("all slugs are unique", () => {
      const slugs = dellDevices.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });
});
