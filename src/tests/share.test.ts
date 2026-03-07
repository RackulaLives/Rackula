/**
 * Tests for Share URL Encoding/Decoding utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pako from "pako";
import {
  encodeLayout,
  decodeLayout,
  toMinimalLayout,
  fromMinimalLayout,
  generateShareUrl,
  getShareParam,
  clearShareParam,
  base64UrlEncode,
} from "$lib/utils/share";
import {
  createTestLayout,
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import type { Layout } from "$lib/types";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to assert encodeLayout returns a non-null string.
 * Use this to safely get encoded values in tests.
 */
function requireEncoded(layout: Layout): string {
  const encoded = encodeLayout(layout);
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("encodeLayout returned null or empty string");
  }
  return encoded;
}

/**
 * Helper to assert decodeLayout returns a non-null Layout.
 * Use this to safely get decoded values in tests.
 */
function requireDecoded(encoded: string): Layout {
  const { layout } = decodeLayout(encoded);
  if (!layout) {
    throw new Error("decodeLayout returned null layout");
  }
  return layout;
}

/**
 * Creates a layout with devices for testing encoding/decoding.
 */
function createLayoutWithDevices(): Layout {
  const deviceType = createTestDeviceType({
    slug: "test-server",
    u_height: 2,
    category: "server",
    model: "Test Server",
  });

  const device = createTestDevice({
    device_type: "test-server",
    position: 5,
    face: "front",
  });

  return createTestLayout({
    name: "Test Layout",
    racks: [
      createTestRack({
        name: "Main Rack",
        height: 42,
        width: 19,
        devices: [device],
      }),
    ],
    device_types: [deviceType],
  });
}

// =============================================================================
// toMinimalLayout Tests
// =============================================================================

describe("toMinimalLayout", () => {
  it("converts layout to minimal format", () => {
    const layout = createLayoutWithDevices();
    const minimal = toMinimalLayout(layout);

    expect(minimal.v).toBe(layout.version);
    expect(minimal.n).toBe(layout.name);
    expect(minimal.rs[0].n).toBe(layout.racks[0].name);
    expect(minimal.rs[0].h).toBe(layout.racks[0].height);
    expect(minimal.rs[0].w).toBe(19);
  });

  it("normalizes rack width 10 to 10", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ width: 10, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].w).toBe(10);
  });

  it("normalizes rack width 19 to 19", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ width: 19, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].w).toBe(19);
  });

  it("normalizes non-standard rack width 21 to 19", () => {
    const layout = createTestLayout({
      // Test legacy/invalid width - cast via unknown for type safety
      racks: [createTestRack({ width: 21 as unknown as 10 | 19, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].w).toBe(19);
  });

  it("normalizes non-standard rack width 23 to 19", () => {
    const layout = createTestLayout({
      // Test legacy/invalid width - cast via unknown for type safety
      racks: [createTestRack({ width: 23 as unknown as 10 | 19, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].w).toBe(19);
  });

  it("only includes device types that are placed", () => {
    const usedType = createTestDeviceType({ slug: "used-device" });
    const unusedType = createTestDeviceType({ slug: "unused-device" });
    const device = createTestDevice({ device_type: "used-device" });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [usedType, unusedType],
    });

    const minimal = toMinimalLayout(layout);

    // Check used device is included
    expect(minimal.dt.find((dt) => dt.s === "used-device")).toBeDefined();
    // Check unused device is excluded
    expect(minimal.dt.find((dt) => dt.s === "unused-device")).toBeUndefined();
  });

  it("converts device types with abbreviated keys", () => {
    const deviceType = createTestDeviceType({
      slug: "test-slug",
      u_height: 2,
      manufacturer: "Test Mfr",
      model: "Test Model",
      category: "server",
    });
    const device = createTestDevice({ device_type: "test-slug" });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);
    const dt = minimal.dt.find((d) => d.s === "test-slug");

    expect(dt).toBeDefined();
    expect(dt!.h).toBe(2);
    expect(dt!.mf).toBe("Test Mfr");
    expect(dt!.m).toBe("Test Model");
    expect(dt!.c).toBeTruthy(); // Color is preserved
    expect(dt!.x).toBe("s"); // server -> s
  });

  it("includes optional device name when set", () => {
    const deviceType = createTestDeviceType({ slug: "server" });
    const device = createTestDevice({
      device_type: "server",
      name: "Primary DB",
    });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].d[0].n).toBe("Primary DB");
  });
});

// =============================================================================
// fromMinimalLayout Tests
// =============================================================================

describe("fromMinimalLayout", () => {
  it("converts minimal format back to full layout", () => {
    const original = createLayoutWithDevices();
    const minimal = toMinimalLayout(original);
    const restored = fromMinimalLayout(minimal);

    expect(restored.version).toBe(original.version);
    expect(restored.name).toBe(original.name);
    expect(restored.racks[0].name).toBe(original.racks[0].name);
    expect(restored.racks[0].height).toBe(original.racks[0].height);
    expect(restored.racks[0].width).toBe(original.racks[0].width);
  });

  it("generates unique IDs for devices", () => {
    const original = createLayoutWithDevices();
    const minimal = toMinimalLayout(original);
    const restored = fromMinimalLayout(minimal);

    expect(restored.racks[0].devices[0].id).toBeTruthy();
  });

  it("sets default layout settings", () => {
    const original = createLayoutWithDevices();
    const minimal = toMinimalLayout(original);
    const restored = fromMinimalLayout(minimal);

    expect(restored.settings.display_mode).toBe("label");
    expect(restored.settings.show_labels_on_images).toBe(false);
  });

  it("sets default rack properties", () => {
    const original = createLayoutWithDevices();
    const minimal = toMinimalLayout(original);
    const restored = fromMinimalLayout(minimal);

    expect(restored.racks[0].desc_units).toBe(false);
    expect(restored.racks[0].form_factor).toBe("4-post-cabinet");
    expect(restored.racks[0].starting_unit).toBe(1);
    expect(restored.racks[0].view).toBe("front");
  });
});

// =============================================================================
// encodeLayout / decodeLayout Tests
// =============================================================================

describe("encodeLayout", () => {
  it("returns a non-null value", () => {
    const layout = createLayoutWithDevices();
    const encoded = encodeLayout(layout);

    expect(encoded).not.toBeNull();
  });

  it("produces URL-safe output (no +, /, =)", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);

    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("produces reasonably sized output for QR codes", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);

    // Only enforce an upper bound suitable for QR codes
    // Don't use tight bounds that break on encoding/compression changes
    expect(encoded.length).toBeLessThan(1600);
  });

  it("encodes empty layout to small output", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ devices: [] })],
      device_types: [],
    });
    const encoded = requireEncoded(layout);

    expect(encoded.length).toBeLessThan(200);
  });
});

describe("decodeLayout", () => {
  it("returns null layout with error for invalid input", () => {
    expect(decodeLayout("invalid").layout).toBeNull();
    expect(decodeLayout("invalid").error).toBeDefined();
    expect(decodeLayout("").layout).toBeNull();
    expect(decodeLayout("!!!").layout).toBeNull();
  });

  it("round-trips layout through encode/decode", () => {
    const original = createLayoutWithDevices();
    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.name).toBe(original.name);
    expect(decoded.racks[0].name).toBe(original.racks[0].name);
    expect(decoded.racks[0].height).toBe(original.racks[0].height);
    // Check device was preserved
    expect(
      decoded.racks[0].devices.find((d) => d.device_type === "test-server"),
    ).toBeDefined();
    // Check device type was preserved
    expect(
      decoded.device_types.find((dt) => dt.slug === "test-server"),
    ).toBeDefined();
  });

  it("preserves device positions", () => {
    const original = createLayoutWithDevices();
    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].devices[0].position).toBe(
      original.racks[0].devices[0].position,
    );
    expect(decoded.racks[0].devices[0].face).toBe(
      original.racks[0].devices[0].face,
    );
  });

  it("preserves device custom names", () => {
    const deviceType = createTestDeviceType({ slug: "server" });
    const device = createTestDevice({
      device_type: "server",
      name: "My Custom Name",
    });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].devices[0].name).toBe("My Custom Name");
  });
});

// =============================================================================
// generateShareUrl Tests
// =============================================================================

describe("generateShareUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.racku.la",
        pathname: "/",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates URL with encoded layout parameter", () => {
    const layout = createLayoutWithDevices();
    const url = generateShareUrl(layout);

    expect(url).toMatch(/^https:\/\/app\.racku\.la\/\?l=/);
    expect(url).toContain("?l=");
  });

  it("uses current origin and pathname", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://custom.domain.com",
        pathname: "/app/",
      },
    });

    const layout = createLayoutWithDevices();
    const url = generateShareUrl(layout);

    expect(url).toMatch(/^https:\/\/custom\.domain\.com\/app\/\?l=/);
  });
});

// =============================================================================
// getShareParam Tests
// =============================================================================

describe("getShareParam", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        search: "",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no parameter present", () => {
    expect(getShareParam()).toBeNull();
  });

  it("returns parameter value when present", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?l=abc123",
      },
    });

    expect(getShareParam()).toBe("abc123");
  });

  it("returns null when different parameter present", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?other=value",
      },
    });

    expect(getShareParam()).toBeNull();
  });
});

// =============================================================================
// clearShareParam Tests
// =============================================================================

describe("clearShareParam", () => {
  let replaceStateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceStateSpy = vi.fn();

    vi.stubGlobal("window", {
      location: {
        href: "https://app.racku.la/?l=abc123",
        search: "?l=abc123",
      },
      history: {
        replaceState: replaceStateSpy,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls replaceState to remove parameter", () => {
    clearShareParam();

    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      "",
      "https://app.racku.la/",
    );
  });

  it("preserves other URL parameters", () => {
    const newSpy = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://app.racku.la/?l=abc123&other=value",
        search: "?l=abc123&other=value",
      },
      history: {
        replaceState: newSpy,
      },
    });

    clearShareParam();

    expect(newSpy).toHaveBeenCalledWith(
      {},
      "",
      "https://app.racku.la/?other=value",
    );
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("share integration", () => {
  it("full round-trip: layout -> encode -> decode -> layout", () => {
    const deviceType = createTestDeviceType({
      slug: "integration-test",
      u_height: 3,
      manufacturer: "Test Corp",
      model: "Model X",
      colour: "#AABBCC",
      category: "network",
    });

    const devices = [
      createTestDevice({
        device_type: "integration-test",
        position: 1,
        face: "front",
        name: "Device 1",
      }),
      createTestDevice({
        device_type: "integration-test",
        position: 5,
        face: "rear",
        name: "Device 2",
      }),
    ];

    const original = createTestLayout({
      name: "Integration Test Layout",
      racks: [
        createTestRack({
          name: "Test Rack",
          height: 24,
          width: 10,
          devices,
        }),
      ],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.name).toBe("Integration Test Layout");
    expect(decoded.racks[0].name).toBe("Test Rack");
    expect(decoded.racks[0].height).toBe(24);
    expect(decoded.racks[0].width).toBe(10);
    // Check both devices were preserved
    expect(
      decoded.racks[0].devices.find((d) => d.name === "Device 1"),
    ).toBeDefined();
    expect(
      decoded.racks[0].devices.find((d) => d.name === "Device 2"),
    ).toBeDefined();
    expect(decoded.device_types[0].manufacturer).toBe("Test Corp");
  });

  it("handles layout with many devices", () => {
    const deviceType = createTestDeviceType({ slug: "bulk-device" });
    const devices = Array.from({ length: 20 }, (_, i) =>
      createTestDevice({
        device_type: "bulk-device",
        position: i + 1,
        face: i % 2 === 0 ? "front" : "rear",
      }),
    );

    const layout = createTestLayout({
      racks: [createTestRack({ height: 42, devices })],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    // Check devices are present at first and last positions (positions are in internal units)
    expect(
      decoded.racks[0].devices.find((d) => d.position === toInternalUnits(1)),
    ).toBeDefined();
    expect(
      decoded.racks[0].devices.find((d) => d.position === toInternalUnits(20)),
    ).toBeDefined();
    expect(decoded.racks[0].devices.length).toBeGreaterThan(0);

    // Output should still be reasonable for QR codes
    expect(encoded.length).toBeLessThan(1600);
  });
});

// =============================================================================
// Multi-Rack Tests (v2 schema)
// =============================================================================

describe("multi-rack share", () => {
  it("round-trips multi-rack layout with devices", () => {
    const serverType = createTestDeviceType({
      slug: "server-1u",
      u_height: 1,
      category: "server",
    });
    const switchType = createTestDeviceType({
      slug: "switch-1u",
      u_height: 1,
      category: "network",
    });

    const rack1 = createTestRack({
      id: "rack-a",
      name: "Rack A",
      height: 42,
      devices: [
        createTestDevice({
          device_type: "server-1u",
          position: 1,
          face: "front",
        }),
      ],
    });
    const rack2 = createTestRack({
      id: "rack-b",
      name: "Rack B",
      height: 24,
      devices: [
        createTestDevice({
          device_type: "switch-1u",
          position: 3,
          face: "front",
        }),
      ],
    });

    const layout = createTestLayout({
      name: "Multi-Rack Layout",
      racks: [rack1, rack2],
      device_types: [serverType, switchType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact rack count
    expect(decoded.racks).toHaveLength(2);
    expect(decoded.racks[0].name).toBe("Rack A");
    expect(decoded.racks[0].height).toBe(42);
    expect(decoded.racks[1].name).toBe("Rack B");
    expect(decoded.racks[1].height).toBe(24);
    expect(
      decoded.racks[0].devices.find((d) => d.device_type === "server-1u"),
    ).toBeDefined();
    expect(
      decoded.racks[1].devices.find((d) => d.device_type === "switch-1u"),
    ).toBeDefined();
  });

  it("round-trips bayed rack group", () => {
    const deviceType = createTestDeviceType({ slug: "device-1u" });
    const rack1 = createTestRack({
      id: "bay-1",
      name: "Bay 1",
      height: 42,
      devices: [createTestDevice({ device_type: "device-1u", position: 1 })],
    });
    const rack2 = createTestRack({
      id: "bay-2",
      name: "Bay 2",
      height: 42,
      devices: [createTestDevice({ device_type: "device-1u", position: 2 })],
    });

    const layout = createTestLayout({
      name: "Bayed Layout",
      racks: [rack1, rack2],
      rack_groups: [
        {
          id: "group-1",
          name: "Server Bay",
          rack_ids: ["bay-1", "bay-2"],
          layout_preset: "bayed",
        },
      ],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact rack count
    expect(decoded.racks).toHaveLength(2);
    expect(decoded.rack_groups).toBeDefined();
    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact group count
    expect(decoded.rack_groups).toHaveLength(1);
    const group = decoded.rack_groups![0];
    expect(group.name).toBe("Server Bay");
    expect(group.layout_preset).toBe("bayed");
    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact rack_ids count
    expect(group.rack_ids).toHaveLength(2);
    expect(group.rack_ids).toContain(decoded.racks[0].id);
    expect(group.rack_ids).toContain(decoded.racks[1].id);
  });

  it("deduplicates device types used across multiple racks", () => {
    const sharedType = createTestDeviceType({ slug: "shared-device" });
    const rack1 = createTestRack({
      id: "r1",
      name: "Rack 1",
      devices: [
        createTestDevice({ device_type: "shared-device", position: 1 }),
      ],
    });
    const rack2 = createTestRack({
      id: "r2",
      name: "Rack 2",
      devices: [
        createTestDevice({ device_type: "shared-device", position: 2 }),
      ],
    });

    const layout = createTestLayout({
      racks: [rack1, rack2],
      device_types: [sharedType],
    });

    const minimal = toMinimalLayout(layout);

    // Should have exactly one device type entry despite being used in both racks
    const matchingTypes = minimal.dt.filter((dt) => dt.s === "shared-device");
    // eslint-disable-next-line no-restricted-syntax -- deduplication behavioral invariant
    expect(matchingTypes).toHaveLength(1);
  });

  it("preserves rack ordering across round-trip", () => {
    const deviceType = createTestDeviceType({ slug: "generic" });
    const racks = ["Alpha", "Beta", "Gamma"].map((name, i) =>
      createTestRack({
        id: `rack-${i}`,
        name,
        devices: [createTestDevice({ device_type: "generic", position: 1 })],
      }),
    );

    const layout = createTestLayout({
      racks,
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].name).toBe("Alpha");
    expect(decoded.racks[1].name).toBe("Beta");
    expect(decoded.racks[2].name).toBe("Gamma");
  });

  it("decodes v1 share links (backward compatibility)", () => {
    // Manually construct a v1 payload (single rack with `r` field)
    const v1Payload = {
      v: "1.0",
      n: "Legacy Layout",
      r: {
        n: "Old Rack",
        h: 42,
        w: 19,
        d: [{ t: "legacy-server", p: 5, f: "front" as const }],
      },
      dt: [{ s: "legacy-server", h: 2, c: "#336699", x: "s" }],
    };

    const json = JSON.stringify(v1Payload);
    const compressed = pako.deflate(json);
    const encoded = base64UrlEncode(compressed);

    const { layout: decoded } = decodeLayout(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe("Legacy Layout");
    expect(decoded!.racks[0].name).toBe("Old Rack");
    expect(decoded!.racks[0].height).toBe(42);
    expect(
      decoded!.racks[0].devices.find((d) => d.device_type === "legacy-server"),
    ).toBeDefined();
    expect(
      decoded!.device_types.find((dt) => dt.slug === "legacy-server"),
    ).toBeDefined();
  });

  it("assigns sequential short IDs to racks in minimal format", () => {
    const deviceType = createTestDeviceType({ slug: "test-dev" });
    const racks = [0, 1, 2].map((i) =>
      createTestRack({
        id: `rack-${i}`,
        name: `Rack ${i}`,
        devices: [createTestDevice({ device_type: "test-dev", position: 1 })],
      }),
    );

    const layout = createTestLayout({
      racks,
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].i).toBe("0");
    expect(minimal.rs[1].i).toBe("1");
    expect(minimal.rs[2].i).toBe("2");
  });

  it("omits rack_groups when layout has none", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    expect(decoded.rack_groups).toBeUndefined();
  });
});
