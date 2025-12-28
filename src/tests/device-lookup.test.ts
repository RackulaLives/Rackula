import { describe, it, expect } from "vitest";
import { findDeviceType, findDeviceInLibrary } from "$lib/utils/device-lookup";
import type { DeviceType } from "$lib/types";

describe("Device Lookup Utility", () => {
  // Mock devices for testing
  const customDevice: DeviceType = {
    slug: "custom-server",
    model: "Custom Server",
    u_height: 2,
    colour: "#ff0000",
    category: "server",
  };

  const layoutDeviceTypes: DeviceType[] = [customDevice];

  describe("findDeviceType", () => {
    it("finds device in layout device_types first (priority 1)", () => {
      const result = findDeviceType("custom-server", layoutDeviceTypes);
      expect(result).toBe(customDevice);
    });

    it("falls back to starter pack if not in layout (priority 2)", () => {
      // '1u-server' is a known starter library device
      const result = findDeviceType("1u-server", []);
      expect(result).toBeDefined();
      expect(result?.slug).toBe("1u-server");
    });

    it("falls back to brand packs if not in layout or starter (priority 3)", () => {
      // 'ubiquiti-unifi-dream-machine-pro' is a known Ubiquiti device
      const result = findDeviceType("ubiquiti-unifi-dream-machine-pro", []);
      expect(result).toBeDefined();
      expect(result?.slug).toBe("ubiquiti-unifi-dream-machine-pro");
    });

    it("returns undefined if not found in any source", () => {
      const result = findDeviceType("non-existent-device-xyz-123", []);
      expect(result).toBeUndefined();
    });

    it("layout devices take priority over starter library", () => {
      // Create a custom device with same slug as a starter device
      const customOverride: DeviceType = {
        slug: "1u-server",
        model: "My Custom 1U",
        u_height: 1,
        colour: "#0000ff",
        category: "server",
      };

      const result = findDeviceType("1u-server", [customOverride]);
      expect(result).toBe(customOverride);
      expect(result?.model).toBe("My Custom 1U");
    });

    it("layout devices take priority over brand packs", () => {
      // Create a custom device with same slug as a brand device
      const customOverride: DeviceType = {
        slug: "ubiquiti-unifi-dream-machine-pro",
        model: "My Custom UDM",
        u_height: 1,
        colour: "#00ff00",
        category: "server",
      };

      const result = findDeviceType("ubiquiti-unifi-dream-machine-pro", [
        customOverride,
      ]);
      expect(result).toBe(customOverride);
      expect(result?.model).toBe("My Custom UDM");
    });

    it("works with empty layout device types array", () => {
      const result = findDeviceType("1u-server", []);
      expect(result).toBeDefined();
    });

    it("works without layout device types parameter (defaults to empty)", () => {
      const result = findDeviceType("1u-server");
      expect(result).toBeDefined();
    });
  });

  describe("is_full_depth property", () => {
    it("blank panels have is_full_depth: false", () => {
      const result = findDeviceType("1u-blank");
      expect(result).toBeDefined();
      expect(result?.is_full_depth).toBe(false);
    });

    it("PDUs have is_full_depth: false", () => {
      const result = findDeviceType("1u-pdu");
      expect(result).toBeDefined();
      expect(result?.is_full_depth).toBe(false);
    });

    it("servers have is_full_depth undefined (defaults to full-depth)", () => {
      const result = findDeviceType("1u-server");
      expect(result).toBeDefined();
      expect(result?.is_full_depth).toBeUndefined();
    });

    it("patch panels have is_full_depth: false", () => {
      const result = findDeviceType("24-port-patch-panel");
      expect(result).toBeDefined();
      expect(result?.is_full_depth).toBe(false);
    });
  });

  describe("findDeviceInLibrary", () => {
    const library: DeviceType[] = [
      {
        slug: "device-a",
        model: "A",
        u_height: 1,
        colour: "#000",
        category: "server",
      },
      {
        slug: "device-b",
        model: "B",
        u_height: 2,
        colour: "#111",
        category: "network",
      },
      {
        slug: "device-c",
        model: "C",
        u_height: 3,
        colour: "#222",
        category: "storage",
      },
    ];

    it("finds device by slug", () => {
      const result = findDeviceInLibrary(library, "device-b");
      expect(result?.model).toBe("B");
    });

    it("returns undefined if not found", () => {
      const result = findDeviceInLibrary(library, "device-z");
      expect(result).toBeUndefined();
    });

    it("works with empty library", () => {
      const result = findDeviceInLibrary([], "device-a");
      expect(result).toBeUndefined();
    });
  });
});
