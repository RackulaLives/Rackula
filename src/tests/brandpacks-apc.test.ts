/**
 * APC Brand Pack Tests
 */

import { describe, it, expect } from "vitest";
import { apcDevices } from "$lib/data/brandPacks/apc";

describe("APC Brand Pack", () => {
  describe("Device Count", () => {
    it("exports correct number of devices", () => {
      expect(apcDevices).toHaveLength(50);
    });
  });

  describe("Common Properties", () => {
    it("all devices have manufacturer set to APC", () => {
      for (const device of apcDevices) {
        expect(device.manufacturer).toBe("APC");
      }
    });

    it("all devices have valid slugs", () => {
      for (const device of apcDevices) {
        expect(device.slug).toBeDefined();
        expect(device.slug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all devices have valid u_height (1-6U for UPS)", () => {
      for (const device of apcDevices) {
        expect(device.u_height).toBeGreaterThanOrEqual(1);
        expect(device.u_height).toBeLessThanOrEqual(6);
      }
    });

    it("all devices have power category", () => {
      for (const device of apcDevices) {
        expect(device.category).toBe("power");
      }
    });
  });

  describe("Specific Devices", () => {
    it("includes SMT1500RM1U UPS with correct properties", () => {
      const ups = apcDevices.find((d) => d.slug === "smt1500rm1u");
      expect(ups).toBeDefined();
      expect(ups?.model).toBe("SMT1500RM1U");
      expect(ups?.u_height).toBe(1);
      expect(ups?.is_full_depth).toBe(true);
    });

    it("includes AP9559 PDU with correct properties", () => {
      const pdu = apcDevices.find((d) => d.slug === "ap9559");
      expect(pdu).toBeDefined();
      expect(pdu?.model).toBe("AP9559");
      expect(pdu?.u_height).toBe(1);
      expect(pdu?.is_full_depth).toBe(false);
    });
  });

  describe("Device Categories", () => {
    it("has UPS devices (SMT/SMC prefix)", () => {
      const upsDevices = apcDevices.filter(
        (d) => d.slug.startsWith("smt") || d.slug.startsWith("smc"),
      );
      expect(upsDevices.length).toBeGreaterThan(0);
    });

    it("has PDU devices (AP prefix)", () => {
      const pduDevices = apcDevices.filter((d) => d.slug.startsWith("ap"));
      expect(pduDevices.length).toBeGreaterThan(0);
    });
  });

  describe("Slug Uniqueness", () => {
    it("all slugs are unique", () => {
      const slugs = apcDevices.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });
});
