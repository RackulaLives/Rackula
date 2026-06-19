/**
 * Tests for bundled images manifest
 * TDD: Write tests first, then implement
 */

import { describe, it, expect } from "vitest";
import { getBundledImage, getBundledImageSlugs } from "$lib/data/bundledImages";

describe("bundledImages", () => {
  describe("getBundledImage", () => {
    it("returns URL for 1u-server front image", () => {
      const url = getBundledImage("1u-server", "front");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url).toContain(".webp");
    });

    it("returns URL for 2u-server front image", () => {
      const url = getBundledImage("2u-server", "front");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
    });

    it("returns URL for 4u-server front image", () => {
      const url = getBundledImage("4u-server", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 24-port-switch front image", () => {
      const url = getBundledImage("24-port-switch", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 48-port-switch front image", () => {
      const url = getBundledImage("48-port-switch", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 1u-router-firewall front image", () => {
      const url = getBundledImage("1u-router-firewall", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 1u-storage front image", () => {
      const url = getBundledImage("1u-storage", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 2u-storage front image", () => {
      const url = getBundledImage("2u-storage", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 4u-storage front image", () => {
      const url = getBundledImage("4u-storage", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 2u-ups front image", () => {
      const url = getBundledImage("2u-ups", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for 1u-console-drawer front image", () => {
      const url = getBundledImage("1u-console-drawer", "front");
      expect(url).toBeDefined();
    });

    it("returns undefined for nonexistent device", () => {
      const url = getBundledImage("nonexistent-device", "front");
      expect(url).toBeUndefined();
    });

    it("returns undefined for rear face when no rear image exists", () => {
      const url = getBundledImage("1u-server", "rear");
      expect(url).toBeUndefined();
    });

    it("returns undefined for device without bundled image", () => {
      // Blanks don't have bundled images
      const url = getBundledImage("1u-blank", "front");
      expect(url).toBeUndefined();
    });
  });

  describe("getBundledImageSlugs", () => {
    it("returns list of device slugs with bundled images", () => {
      const slugs = getBundledImageSlugs();
      expect(Array.isArray(slugs)).toBe(true);
      // 11 starter library + brand pack images (dynamically generated)
      expect(slugs.length).toBeGreaterThanOrEqual(11);
    });

    it("includes all starter library server slugs", () => {
      const slugs = getBundledImageSlugs();
      expect(slugs).toContain("1u-server");
      expect(slugs).toContain("2u-server");
      expect(slugs).toContain("4u-server");
    });

    it("includes all starter library network slugs", () => {
      const slugs = getBundledImageSlugs();
      expect(slugs).toContain("24-port-switch");
      expect(slugs).toContain("48-port-switch");
      expect(slugs).toContain("1u-router-firewall");
    });

    it("includes all starter library storage slugs", () => {
      const slugs = getBundledImageSlugs();
      expect(slugs).toContain("1u-storage");
      expect(slugs).toContain("2u-storage");
      expect(slugs).toContain("4u-storage");
    });

    it("includes starter library power slugs", () => {
      const slugs = getBundledImageSlugs();
      expect(slugs).toContain("2u-ups");
    });

    it("includes starter library kvm slugs", () => {
      const slugs = getBundledImageSlugs();
      expect(slugs).toContain("1u-console-drawer");
    });

    it("includes Ubiquiti brand pack slugs", () => {
      const slugs = getBundledImageSlugs();
      expect(slugs).toContain("ubiquiti-unifi-dream-machine-pro");
      expect(slugs).toContain("ubiquiti-unifi-dream-machine-pro-max");
      expect(slugs).toContain("ubiquiti-unifi-switch-24-pro");
      expect(slugs).toContain("ubiquiti-unifi-switch-pro-max-24-poe");
      expect(slugs).toContain("ubiquiti-usp-pdu-pro");
    });
  });

  describe("Ubiquiti brand pack images", () => {
    it("returns URL for UDM-Pro front image", () => {
      const url = getBundledImage("ubiquiti-unifi-dream-machine-pro", "front");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url).toContain(".webp");
    });

    it("returns URL for UDM-Pro rear image", () => {
      const url = getBundledImage("ubiquiti-unifi-dream-machine-pro", "rear");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url).toContain(".webp");
    });

    it("returns URL for USW-Pro-24 front image", () => {
      const url = getBundledImage("ubiquiti-unifi-switch-24-pro", "front");
      expect(url).toBeDefined();
    });

    it("returns URL for UNVR front and rear images", () => {
      expect(
        getBundledImage(
          "ubiquiti-unifi-protect-network-video-recorder",
          "front",
        ),
      ).toBeDefined();
      expect(
        getBundledImage(
          "ubiquiti-unifi-protect-network-video-recorder",
          "rear",
        ),
      ).toBeDefined();
    });

    it("returns URL for USP-PDU-Pro front and rear images", () => {
      expect(getBundledImage("ubiquiti-usp-pdu-pro", "front")).toBeDefined();
      expect(getBundledImage("ubiquiti-usp-pdu-pro", "rear")).toBeDefined();
    });
  });
});
