/**
 * Supermicro Brand Pack Tests
 */

import { describe, it, expect } from "vitest";
import { supermicroDevices } from "$lib/data/brandPacks/supermicro";

describe("Supermicro Brand Pack", () => {
  describe("Device Count", () => {
    it("exports correct number of devices", () => {
      expect(supermicroDevices).toHaveLength(22);
    });
  });

  describe("Common Properties", () => {
    it("all devices have manufacturer set to Supermicro", () => {
      for (const device of supermicroDevices) {
        expect(device.manufacturer).toBe("Supermicro");
      }
    });

    it("all devices have valid slugs", () => {
      for (const device of supermicroDevices) {
        expect(device.slug).toBeDefined();
        expect(device.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all devices have valid u_height (1-4U)", () => {
      for (const device of supermicroDevices) {
        expect(device.u_height).toBeGreaterThanOrEqual(1);
        expect(device.u_height).toBeLessThanOrEqual(4);
      }
    });

    it("all devices have valid category", () => {
      const validCategories = ["server", "storage"];
      for (const device of supermicroDevices) {
        expect(validCategories).toContain(device.category);
      }
    });
  });

  describe("Specific Devices", () => {
    it("includes SYS-5019D-FN8TP with correct properties", () => {
      const sys5019 = supermicroDevices.find(
        (d) => d.slug === "sys-5019d-fn8tp",
      );
      expect(sys5019).toBeDefined();
      expect(sys5019?.model).toBe("SYS-5019D-FN8TP");
      expect(sys5019?.u_height).toBe(1);
      expect(sys5019?.is_full_depth).toBe(false);
      expect(sys5019?.category).toBe("server");
    });

    it("includes SYS-6029P-TR with correct properties", () => {
      const sys6029 = supermicroDevices.find((d) => d.slug === "sys-6029p-tr");
      expect(sys6029).toBeDefined();
      expect(sys6029?.model).toBe("SYS-6029P-TR");
      expect(sys6029?.u_height).toBe(2);
      expect(sys6029?.is_full_depth).toBe(true);
    });

    it("includes SuperStorage 4U storage server", () => {
      const ssg6049 = supermicroDevices.find(
        (d) => d.slug === "ssg-6049p-e1cr36h",
      );
      expect(ssg6049).toBeDefined();
      expect(ssg6049?.u_height).toBe(4);
      expect(ssg6049?.category).toBe("storage");
    });
  });

  describe("Form Factor Coverage", () => {
    it("has 1U servers", () => {
      const oneU = supermicroDevices.filter((d) => d.u_height === 1);
      expect(oneU.length).toBeGreaterThan(0);
    });

    it("has 2U servers", () => {
      const twoU = supermicroDevices.filter((d) => d.u_height === 2);
      expect(twoU.length).toBeGreaterThan(0);
    });

    it("has short-depth (entry-level) servers", () => {
      const shortDepth = supermicroDevices.filter(
        (d) => d.is_full_depth === false,
      );
      expect(shortDepth.length).toBeGreaterThan(0);
    });
  });

  describe("Slug Uniqueness", () => {
    it("all slugs are unique", () => {
      const slugs = supermicroDevices.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });
});
