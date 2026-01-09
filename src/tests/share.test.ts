/**
 * Share Utilities Tests
 * Tests for URL-based layout sharing with compression
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encodeLayout,
  decodeLayout,
  toMinimalLayout,
  fromMinimalLayout,
  generateShareUrl,
  getShareParam,
  clearShareParam,
} from "$lib/utils/share";
import { CATEGORY_TO_ABBREV, ABBREV_TO_CATEGORY } from "$lib/schemas/share";
import type { Layout } from "$lib/types";

describe("Share Utilities", () => {
  const createTestLayout = (): Layout => ({
    version: "1.0.0",
    name: "Test Layout",
    racks: [
      {
        id: "rack-1",
        name: "Main Rack",
        height: 42,
        width: 19,
        desc_units: false,
        form_factor: "4-post-cabinet",
        starting_unit: 1,
        position: 0,
        devices: [],
      },
    ],
    device_types: [],
    settings: {
      display_mode: "label",
      show_labels_on_images: true,
    },
  });

  describe("Category Abbreviation Maps", () => {
    it("has all 12 categories mapped", () => {
      expect(Object.keys(CATEGORY_TO_ABBREV)).toHaveLength(12);
    });

    it("maps are bidirectional", () => {
      for (const [category, abbrev] of Object.entries(CATEGORY_TO_ABBREV)) {
        expect(ABBREV_TO_CATEGORY[abbrev]).toBe(category);
      }
    });

    it("all abbreviations are single characters", () => {
      for (const abbrev of Object.values(CATEGORY_TO_ABBREV)) {
        expect(abbrev).toHaveLength(1);
      }
    });
  });

  describe("toMinimalLayout", () => {
    it("converts layout to minimal format", () => {
      const layout = createTestLayout();
      const minimal = toMinimalLayout(layout);

      expect(minimal.v).toBe("1.0.0");
      expect(minimal.n).toBe("Test Layout");
      expect(minimal.r.n).toBe("Main Rack");
      expect(minimal.r.h).toBe(42);
      expect(minimal.r.w).toBe(19);
    });

    it("only includes device types that are used", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "used-server",
          u_height: 2,
          colour: "#3b82f6",
          category: "server",
        },
        {
          slug: "unused-device",
          u_height: 1,
          colour: "#666666",
          category: "other",
        },
      ];
      layout.racks[0].devices = [
        {
          id: "device-1",
          device_type: "used-server",
          position: 5,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(layout);

      expect(minimal.dt).toHaveLength(1);
      expect(minimal.dt[0]?.s).toBe("used-server");
    });

    it("abbreviates category names", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "test-server",
          u_height: 2,
          colour: "#000",
          category: "server",
        },
      ];
      layout.racks[0].devices = [
        {
          id: "device-1",
          device_type: "test-server",
          position: 1,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(layout);

      expect(minimal.dt[0]?.x).toBe("s"); // 'server' -> 's' (x is category abbreviation)
    });

    it("omits optional model when not set", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "minimal-device",
          u_height: 1,
          colour: "#000",
          category: "server",
        },
      ];
      layout.racks[0].devices = [
        {
          id: "device-1",
          device_type: "minimal-device",
          position: 1,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(layout);

      // Model should not be present when not set
      expect(minimal.dt[0]).not.toHaveProperty("m");
    });

    it("includes model when set", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "full-device",
          u_height: 2,
          model: "R740",
          colour: "#3b82f6",
          category: "server",
        },
      ];
      layout.racks[0].devices = [
        {
          id: "device-1",
          device_type: "full-device",
          position: 1,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(layout);

      // Model is 'm' in minimal format
      expect(minimal.dt[0]?.m).toBe("R740");
    });
  });

  describe("fromMinimalLayout", () => {
    it("restores layout from minimal format", () => {
      const original = createTestLayout();
      const minimal = toMinimalLayout(original);
      const restored = fromMinimalLayout(minimal);

      expect(restored.version).toBe("1.0.0");
      expect(restored.name).toBe("Test Layout");
      expect(restored.racks[0].name).toBe("Main Rack");
      expect(restored.racks[0].height).toBe(42);
    });

    it("generates new IDs for devices", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "test-device",
          u_height: 1,
          colour: "#000",
          category: "server",
        },
      ];
      layout.racks[0].devices = [
        {
          id: "original-id",
          device_type: "test-device",
          position: 5,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(layout);
      const restored = fromMinimalLayout(minimal);

      // ID should be generated, not the original
      expect(restored.racks[0].devices[0]?.id).toBeDefined();
      expect(restored.racks[0].devices[0]?.id).not.toBe("original-id");
    });

    it("generates unique UUIDs for each device", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "test-device",
          u_height: 1,
          colour: "#000",
          category: "server",
        },
      ];
      layout.racks[0].devices = [
        {
          id: "device-1",
          device_type: "test-device",
          position: 1,
          face: "front",
        },
        {
          id: "device-2",
          device_type: "test-device",
          position: 2,
          face: "front",
        },
        {
          id: "device-3",
          device_type: "test-device",
          position: 3,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(layout);
      const restored = fromMinimalLayout(minimal);

      // All IDs should be unique
      const ids = restored.racks[0].devices.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);

      // IDs should be valid UUIDs (v4 format)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (const id of ids) {
        expect(id).toMatch(uuidRegex);
      }
    });

    it("expands abbreviated categories back to full names", () => {
      const layout = createTestLayout();
      layout.device_types = [
        { slug: "test-net", u_height: 1, colour: "#000", category: "network" },
      ];
      layout.racks[0].devices = [
        { id: "d1", device_type: "test-net", position: 1, face: "front" },
      ];

      const minimal = toMinimalLayout(layout);
      expect(minimal.dt[0]?.x).toBe("n"); // abbreviated (x is category)

      const restored = fromMinimalLayout(minimal);
      expect(restored.device_types[0]?.category).toBe("network"); // expanded
    });
  });

  describe("encodeLayout", () => {
    it("returns a URL-safe string", () => {
      const layout = createTestLayout();
      const encoded = encodeLayout(layout);

      // Should only contain URL-safe base64 characters
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("does not contain standard base64 padding", () => {
      const layout = createTestLayout();
      const encoded = encodeLayout(layout);

      expect(encoded).not.toContain("=");
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
    });

    it("produces reasonably sized output", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "server-1",
          u_height: 2,
          colour: "#3b82f6",
          category: "server",
        },
      ];
      layout.racks[0].devices = [
        { id: "device-1", device_type: "server-1", position: 5, face: "front" },
      ];

      const encoded = encodeLayout(layout);

      // Should produce a reasonably compact encoding
      expect(encoded.length).toBeLessThan(250);
      expect(encoded.length).toBeGreaterThan(50);
    });

    it("handles empty layout", () => {
      const layout = createTestLayout();
      layout.device_types = [];
      layout.racks[0].devices = [];

      const encoded = encodeLayout(layout);
      expect(encoded).toBeDefined();
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("handles layout with many devices", () => {
      const layout = createTestLayout();
      layout.device_types = [
        { slug: "server", u_height: 1, colour: "#000", category: "server" },
      ];

      for (let i = 0; i < 40; i++) {
        layout.racks[0].devices.push({
          id: `device-${i}`,
          device_type: "server",
          position: i + 1,
          face: "front",
        });
      }

      const encoded = encodeLayout(layout);

      // Should still be under QR code limit (~1588 chars)
      expect(encoded.length).toBeLessThan(1600);
    });
  });

  describe("decodeLayout", () => {
    // Suppress console warnings for error case tests
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("decodes valid encoded layout", () => {
      const original = createTestLayout();
      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.name).toBe("Test Layout");
      expect(decoded?.racks[0].name).toBe("Main Rack");
    });

    it("returns null for invalid base64", () => {
      const decoded = decodeLayout("!!!invalid!!!");
      expect(decoded).toBeNull();
    });

    it("returns null for corrupted data", () => {
      const decoded = decodeLayout("YWJjZGVmZ2hpamtsbW5v"); // valid base64, invalid content
      expect(decoded).toBeNull();
    });

    it("returns null for empty string", () => {
      const decoded = decodeLayout("");
      expect(decoded).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      // This creates valid base64 of garbage data
      const decoded = decodeLayout("eJxLy0zNAQADwwFp");
      expect(decoded).toBeNull();
    });
  });

  describe("round-trip encode/decode", () => {
    it("preserves layout name and version", () => {
      const original = createTestLayout();
      original.name = "My Homelab Setup";

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      expect(decoded?.name).toBe("My Homelab Setup");
      expect(decoded?.version).toBe("1.0.0");
    });

    it("preserves rack properties", () => {
      const original = createTestLayout();
      original.racks[0].name = "Network Rack";
      original.racks[0].height = 24;
      original.racks[0].width = 10;

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      expect(decoded?.racks[0].name).toBe("Network Rack");
      expect(decoded?.racks[0].height).toBe(24);
      expect(decoded?.racks[0].width).toBe(10);
    });

    it("preserves device types with core properties", () => {
      const original = createTestLayout();
      original.device_types = [
        {
          slug: "dell-r740",
          u_height: 2,
          manufacturer: "Dell",
          model: "PowerEdge R740",
          colour: "#3b82f6",
          category: "server",
        },
      ];
      original.racks[0].devices = [
        {
          id: "device-1",
          device_type: "dell-r740",
          position: 10,
          face: "front",
        },
      ];

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      expect(decoded?.device_types).toHaveLength(1);
      const dt = decoded?.device_types[0];
      expect(dt?.slug).toBe("dell-r740");
      expect(dt?.manufacturer).toBe("Dell");
      expect(dt?.model).toBe("PowerEdge R740");
      expect(dt?.colour).toBe("#3b82f6");
      expect(dt?.category).toBe("server");
      expect(dt?.u_height).toBe(2);
    });

    it("preserves manufacturer field when set", () => {
      const original = createTestLayout();
      original.device_types = [
        {
          slug: "cisco-switch",
          u_height: 1,
          manufacturer: "Cisco",
          model: "Catalyst 2960",
          colour: "#10b981",
          category: "network",
        },
      ];
      original.racks[0].devices = [
        {
          id: "device-1",
          device_type: "cisco-switch",
          position: 1,
          face: "front",
        },
      ];

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      const dt = decoded?.device_types[0];
      expect(dt?.manufacturer).toBe("Cisco");
      expect(dt?.model).toBe("Catalyst 2960");
    });

    it("omits manufacturer when not set", () => {
      const original = createTestLayout();
      original.device_types = [
        {
          slug: "generic-device",
          u_height: 1,
          colour: "#666",
          category: "other",
        },
      ];
      original.racks[0].devices = [
        {
          id: "device-1",
          device_type: "generic-device",
          position: 1,
          face: "front",
        },
      ];

      const minimal = toMinimalLayout(original);

      // Manufacturer should not be in minimal format when not set
      expect(minimal.dt[0]).not.toHaveProperty("mf");
    });

    it("preserves placed devices", () => {
      const original = createTestLayout();
      original.device_types = [
        {
          slug: "test-device",
          u_height: 2,
          colour: "#000",
          category: "server",
        },
      ];
      original.racks[0].devices = [
        {
          id: "device-1",
          device_type: "test-device",
          position: 5,
          face: "front",
        },
        {
          id: "device-2",
          device_type: "test-device",
          position: 10,
          face: "rear",
        },
      ];

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      expect(decoded?.racks[0].devices).toHaveLength(2);
      expect(decoded?.racks[0].devices[0]?.position).toBe(5);
      expect(decoded?.racks[0].devices[0]?.face).toBe("front");
      expect(decoded?.racks[0].devices[1]?.position).toBe(10);
      expect(decoded?.racks[0].devices[1]?.face).toBe("rear");
    });

    it("applies default settings on decode", () => {
      // Settings are not preserved in minimal format to reduce size
      // Instead, defaults are applied on decode
      const original = createTestLayout();
      original.settings = {
        display_mode: "image",
        show_labels_on_images: true,
      };

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      // Decoded layout gets default settings
      expect(decoded?.settings).toBeDefined();
      expect(decoded?.settings.display_mode).toBe("label");
      expect(decoded?.settings.show_labels_on_images).toBe(false);
    });

    it("only includes used device types after round-trip", () => {
      const original = createTestLayout();
      original.device_types = [
        { slug: "used", u_height: 1, colour: "#000", category: "server" },
        { slug: "unused", u_height: 2, colour: "#000", category: "network" },
      ];
      original.racks[0].devices = [
        { id: "d1", device_type: "used", position: 1, face: "front" },
      ];

      const encoded = encodeLayout(original);
      const decoded = decodeLayout(encoded);

      // Only used device type should be present
      expect(decoded?.device_types).toHaveLength(1);
      expect(decoded?.device_types[0]?.slug).toBe("used");
    });
  });

  describe("generateShareUrl", () => {
    // Mock location
    const originalLocation = window.location;

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        value: {
          ...originalLocation,
          origin: "https://app.racku.la",
          pathname: "/",
          href: "https://app.racku.la/",
        },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("generates URL with l parameter", () => {
      const layout = createTestLayout();
      const url = generateShareUrl(layout);

      expect(url).toContain("https://app.racku.la/");
      expect(url).toContain("?l=");
    });

    it("encoded parameter is URL-safe", () => {
      const layout = createTestLayout();
      const url = generateShareUrl(layout);
      const param = new URL(url).searchParams.get("l");

      // Should only contain URL-safe characters
      expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe("getShareParam", () => {
    const originalLocation = window.location;

    afterEach(() => {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("returns null when no l param", () => {
      Object.defineProperty(window, "location", {
        value: {
          ...originalLocation,
          search: "",
        },
        writable: true,
      });

      expect(getShareParam()).toBeNull();
    });

    it("returns l param when present", () => {
      Object.defineProperty(window, "location", {
        value: {
          ...originalLocation,
          search: "?l=abc123",
        },
        writable: true,
      });

      expect(getShareParam()).toBe("abc123");
    });
  });

  describe("clearShareParam", () => {
    it("removes the l param from URL", () => {
      // Since replaceState has cross-origin restrictions in test environment,
      // we test by mocking replaceState completely
      const replaceStateSpy = vi.fn();
      window.history.replaceState = replaceStateSpy;

      Object.defineProperty(window, "location", {
        value: {
          origin: "http://localhost:3000",
          pathname: "/",
          search: "?l=abc123",
          href: "http://localhost:3000/?l=abc123",
        },
        writable: true,
      });

      clearShareParam();

      expect(replaceStateSpy).toHaveBeenCalled();
      // Check that the URL passed doesn't contain the l param
      const urlArg = replaceStateSpy.mock.calls[0]?.[2];
      expect(urlArg).toBe("http://localhost:3000/");
    });
  });

  describe("size expectations", () => {
    it("empty rack is under 500 characters", () => {
      const layout = createTestLayout();
      const encoded = encodeLayout(layout);

      expect(encoded.length).toBeLessThan(500);
    });

    it("10 devices is under 700 characters", () => {
      const layout = createTestLayout();
      layout.device_types = [
        { slug: "server", u_height: 1, colour: "#3b82f6", category: "server" },
      ];
      for (let i = 0; i < 10; i++) {
        layout.racks[0].devices.push({
          id: `device-${i}`,
          device_type: "server",
          position: i + 1,
          face: "front",
        });
      }

      const encoded = encodeLayout(layout);
      expect(encoded.length).toBeLessThan(700);
    });

    it("20 devices is under 900 characters", () => {
      const layout = createTestLayout();
      layout.device_types = [
        { slug: "server", u_height: 1, colour: "#3b82f6", category: "server" },
      ];
      for (let i = 0; i < 20; i++) {
        layout.racks[0].devices.push({
          id: `device-${i}`,
          device_type: "server",
          position: i + 1,
          face: "front",
        });
      }

      const encoded = encodeLayout(layout);
      expect(encoded.length).toBeLessThan(900);
    });

    it("40 devices with multiple types is under 1400 characters", () => {
      const layout = createTestLayout();
      layout.device_types = [
        {
          slug: "server-type",
          u_height: 2,
          colour: "#3b82f6",
          category: "server",
          manufacturer: "Dell",
          model: "R740",
        },
        {
          slug: "network-type",
          u_height: 1,
          colour: "#10b981",
          category: "network",
          manufacturer: "Cisco",
          model: "Catalyst",
        },
      ];

      for (let i = 0; i < 40; i++) {
        layout.racks[0].devices.push({
          id: `device-${i}`,
          device_type: i % 2 === 0 ? "server-type" : "network-type",
          position: i + 1,
          face: i % 2 === 0 ? "front" : "rear",
        });
      }

      const encoded = encodeLayout(layout);
      expect(encoded.length).toBeLessThan(1400);
    });
  });
});
