/**
 * Layout Helpers Tests
 *
 * Comprehensive tests for src/lib/stores/layout-helpers.ts
 * Tests factory functions, lookups, and layout manipulation helpers.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createDeviceType,
  createDevice,
  findDeviceType,
  getDeviceDisplayName,
  addDeviceTypeToLayout,
  removeDeviceTypeFromLayout,
  placeDeviceInRack,
  removeDeviceFromRack,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import {
  createTestLayout,
  createTestDeviceType,
  createTestDevice,
  createTestRack,
} from "./factories";
import type { Layout, DeviceType, PlacedDevice } from "$lib/types";

// =============================================================================
// createDeviceType Tests
// =============================================================================

describe("createDeviceType", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a device type with required fields", () => {
    const input: CreateDeviceTypeInput = {
      name: "Test Server",
      u_height: 2,
      category: "server",
      colour: "#336699",
    };

    const result = createDeviceType(input);

    expect(result.u_height).toBe(2);
    // Schema v1.0.0: Flat structure with colour and category at top level
    expect(result.category).toBe("server");
    expect(result.colour).toBe("#336699");
    expect(result.slug).toBeDefined();
    expect(typeof result.slug).toBe("string");
  });

  it("generates slug from name when no manufacturer/model provided", () => {
    const input: CreateDeviceTypeInput = {
      name: "Custom Server",
      u_height: 1,
      category: "server",
      colour: "#FF0000",
    };

    const result = createDeviceType(input);

    expect(result.slug).toBe("custom-server");
    expect(result.model).toBe("Custom Server");
  });

  it("generates slug from manufacturer and model when both provided", () => {
    const input: CreateDeviceTypeInput = {
      name: "Ignored Name",
      u_height: 1,
      category: "network",
      colour: "#00FF00",
      manufacturer: "Ubiquiti",
      model: "USW-Pro-24",
    };

    const result = createDeviceType(input);

    expect(result.slug).toBe("ubiquiti-usw-pro-24");
    expect(result.manufacturer).toBe("Ubiquiti");
    expect(result.model).toBe("USW-Pro-24");
  });

  it("falls back to name for model when model not provided", () => {
    const input: CreateDeviceTypeInput = {
      name: "My Device",
      u_height: 1,
      category: "server",
      colour: "#000000",
    };

    const result = createDeviceType(input);

    expect(result.model).toBe("My Device");
  });

  it("sets optional is_full_depth field", () => {
    const input: CreateDeviceTypeInput = {
      name: "Half Depth Switch",
      u_height: 1,
      category: "network",
      colour: "#50FA7B",
      is_full_depth: false,
    };

    const result = createDeviceType(input);

    expect(result.is_full_depth).toBe(false);
  });

  it("sets optional weight fields", () => {
    const input: CreateDeviceTypeInput = {
      name: "Heavy Server",
      u_height: 4,
      category: "server",
      colour: "#336699",
      weight: 25.5,
      weight_unit: "kg",
    };

    const result = createDeviceType(input);

    expect(result.weight).toBe(25.5);
    expect(result.weight_unit).toBe("kg");
  });

  it("sets optional airflow field", () => {
    const input: CreateDeviceTypeInput = {
      name: "Server with Airflow",
      u_height: 2,
      category: "server",
      colour: "#336699",
      airflow: "front-to-rear",
    };

    const result = createDeviceType(input);

    expect(result.airflow).toBe("front-to-rear");
  });

  it("sets optional notes field", () => {
    const input: CreateDeviceTypeInput = {
      name: "Documented Device",
      u_height: 1,
      category: "other",
      colour: "#888888",
      notes: "This is a test note",
    };

    const result = createDeviceType(input);

    // Schema v1.0.0: Uses 'notes' instead of 'comments'
    expect(result.notes).toBe("This is a test note");
  });

  it("sets optional tags field when tags array is non-empty", () => {
    const input: CreateDeviceTypeInput = {
      name: "Tagged Device",
      u_height: 1,
      category: "server",
      colour: "#336699",
      tags: ["production", "critical"],
    };

    const result = createDeviceType(input);

    // Schema v1.0.0: Flat structure, tags at top level
    expect(result.tags).toEqual(["production", "critical"]);
  });

  it("does not set tags field when tags array is empty", () => {
    const input: CreateDeviceTypeInput = {
      name: "Untagged Device",
      u_height: 1,
      category: "server",
      colour: "#336699",
      tags: [],
    };

    const result = createDeviceType(input);

    // Schema v1.0.0: Flat structure, tags at top level
    expect(result.tags).toBeUndefined();
  });

  it("handles all optional fields together", () => {
    const input: CreateDeviceTypeInput = {
      name: "Full Featured Device",
      u_height: 3,
      category: "storage",
      colour: "#FF6600",
      manufacturer: "Synology",
      model: "DS920+",
      is_full_depth: true,
      weight: 10.5,
      weight_unit: "lb",
      airflow: "side-to-rear",
      notes: "NAS storage",
      tags: ["nas", "backup"],
    };

    const result = createDeviceType(input);

    expect(result.slug).toBe("synology-ds920-plus");
    expect(result.u_height).toBe(3);
    expect(result.manufacturer).toBe("Synology");
    expect(result.model).toBe("DS920+");
    expect(result.is_full_depth).toBe(true);
    expect(result.weight).toBe(10.5);
    expect(result.weight_unit).toBe("lb");
    expect(result.airflow).toBe("side-to-rear");
    expect(result.notes).toBe("NAS storage");
    // Schema v1.0.0: Flat structure
    expect(result.category).toBe("storage");
    expect(result.colour).toBe("#FF6600");
    expect(result.tags).toEqual(["nas", "backup"]);
  });

  it("handles special characters in names for slug generation", () => {
    const input: CreateDeviceTypeInput = {
      name: "Server #1 (Test)",
      u_height: 1,
      category: "server",
      colour: "#000000",
    };

    const result = createDeviceType(input);

    // slugify should handle special characters
    expect(result.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(result.slug).not.toContain("#");
    expect(result.slug).not.toContain("(");
  });

  it("generates timestamp-based slug when name is empty", () => {
    // Mock Date.now to get predictable results
    const mockTimestamp = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(mockTimestamp);

    const input: CreateDeviceTypeInput = {
      name: "",
      u_height: 1,
      category: "server",
      colour: "#000000",
    };

    const result = createDeviceType(input);

    expect(result.slug).toBe(`device-${mockTimestamp}`);
  });

  it("defaults is_full_depth to true for shelf category", () => {
    const input: CreateDeviceTypeInput = {
      name: "1U Shelf",
      u_height: 1,
      category: "shelf",
      colour: "#8BE9FD",
    };

    const result = createDeviceType(input);

    // Shelf devices span full rack depth by design
    expect(result.is_full_depth).toBe(true);
  });

  it("allows explicit is_full_depth override for shelf category", () => {
    const input: CreateDeviceTypeInput = {
      name: "Half Depth Shelf",
      u_height: 1,
      category: "shelf",
      colour: "#8BE9FD",
      is_full_depth: false,
    };

    const result = createDeviceType(input);

    // Explicit override should be respected
    expect(result.is_full_depth).toBe(false);
  });

  it("does not auto-set is_full_depth for non-shelf categories", () => {
    const input: CreateDeviceTypeInput = {
      name: "Server",
      u_height: 2,
      category: "server",
      colour: "#336699",
    };

    const result = createDeviceType(input);

    // Non-shelf categories should not have is_full_depth auto-set
    expect(result.is_full_depth).toBeUndefined();
  });
});

// =============================================================================
// createDevice Tests
// =============================================================================

describe("createDevice", () => {
  it("creates a placed device with required fields", () => {
    const result = createDevice("test-device", 10, "front");

    expect(result.device_type).toBe("test-device");
    expect(result.position).toBe(10);
    expect(result.face).toBe("front");
    expect(result.name).toBeUndefined();
  });

  it("creates a placed device with optional name", () => {
    const result = createDevice("server-1", 5, "rear", "My Server");

    expect(result.device_type).toBe("server-1");
    expect(result.position).toBe(5);
    expect(result.face).toBe("rear");
    expect(result.name).toBe("My Server");
  });

  it("creates a placed device with full-depth face", () => {
    const result = createDevice("ups-1", 1, "full-depth");

    expect(result.face).toBe("full-depth");
  });

  it("handles position 0", () => {
    const result = createDevice("test", 0, "front");

    expect(result.position).toBe(0);
  });

  it("handles empty string for name (still sets it)", () => {
    const result = createDevice("test", 1, "front", "");

    // Empty string is still a defined value
    expect(result.name).toBe("");
  });
});

// =============================================================================
// findDeviceType Tests
// =============================================================================

describe("findDeviceType", () => {
  let deviceTypes: DeviceType[];

  beforeEach(() => {
    deviceTypes = [
      createTestDeviceType({
        slug: "server-1",
        u_height: 2,
        category: "server",
      }),
      createTestDeviceType({
        slug: "switch-1",
        u_height: 1,
        category: "network",
      }),
      createTestDeviceType({ slug: "pdu-1", u_height: 1, category: "power" }),
    ];
  });

  it("finds device type by slug", () => {
    const result = findDeviceType(deviceTypes, "server-1");

    expect(result).toBeDefined();
    expect(result?.slug).toBe("server-1");
    expect(result?.u_height).toBe(2);
  });

  it("returns undefined for non-existent slug", () => {
    const result = findDeviceType(deviceTypes, "non-existent");

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty slug", () => {
    const result = findDeviceType(deviceTypes, "");

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty device types array", () => {
    const result = findDeviceType([], "server-1");

    expect(result).toBeUndefined();
  });

  it("is case-sensitive", () => {
    const result = findDeviceType(deviceTypes, "SERVER-1");

    expect(result).toBeUndefined();
  });

  it("finds first matching device type if duplicates exist", () => {
    const duplicates = [
      createTestDeviceType({ slug: "dup", model: "First" }),
      createTestDeviceType({ slug: "dup", model: "Second" }),
    ];

    const result = findDeviceType(duplicates, "dup");

    expect(result?.model).toBe("First");
  });
});

// =============================================================================
// getDeviceDisplayName Tests
// =============================================================================

describe("getDeviceDisplayName", () => {
  let deviceTypes: DeviceType[];

  beforeEach(() => {
    deviceTypes = [
      createTestDeviceType({ slug: "with-model", model: "Custom Model Name" }),
      createTestDeviceType({ slug: "without-model" }),
    ];
    // Remove model from second device type to test fallback
    delete deviceTypes[1].model;
  });

  it("returns device name when set", () => {
    const device = createTestDevice({
      device_type: "with-model",
      name: "My Named Server",
    });

    const result = getDeviceDisplayName(device, deviceTypes);

    expect(result).toBe("My Named Server");
  });

  it("returns device type model when device name not set", () => {
    const device = createTestDevice({ device_type: "with-model" });

    const result = getDeviceDisplayName(device, deviceTypes);

    expect(result).toBe("Custom Model Name");
  });

  it("returns slug when neither device name nor model available", () => {
    const device = createTestDevice({ device_type: "without-model" });

    const result = getDeviceDisplayName(device, deviceTypes);

    expect(result).toBe("without-model");
  });

  it("returns slug when device type not found", () => {
    const device = createTestDevice({ device_type: "non-existent" });

    const result = getDeviceDisplayName(device, deviceTypes);

    expect(result).toBe("non-existent");
  });

  it("prefers device name over model", () => {
    const device = createTestDevice({
      device_type: "with-model",
      name: "Override Name",
    });

    const result = getDeviceDisplayName(device, deviceTypes);

    expect(result).toBe("Override Name");
  });

  it("handles empty device name (returns model)", () => {
    const device: PlacedDevice = {
      device_type: "with-model",
      position: 1,
      face: "front",
      name: "", // Empty string is falsy
    };

    const result = getDeviceDisplayName(device, deviceTypes);

    // Empty string is falsy, so it falls through to model
    expect(result).toBe("Custom Model Name");
  });
});

// =============================================================================
// addDeviceTypeToLayout Tests
// =============================================================================

describe("addDeviceTypeToLayout", () => {
  let layout: Layout;

  beforeEach(() => {
    layout = createTestLayout({
      device_types: [createTestDeviceType({ slug: "existing-device" })],
    });
  });

  it("adds a new device type to the layout", () => {
    const newDeviceType = createTestDeviceType({ slug: "new-device" });

    const result = addDeviceTypeToLayout(layout, newDeviceType);

    expect(result.device_types).toHaveLength(2);
    expect(result.device_types[1].slug).toBe("new-device");
  });

  it("returns a new layout object (immutable)", () => {
    const newDeviceType = createTestDeviceType({ slug: "new-device" });

    const result = addDeviceTypeToLayout(layout, newDeviceType);

    expect(result).not.toBe(layout);
    expect(result.device_types).not.toBe(layout.device_types);
  });

  it("preserves original layout device_types", () => {
    const newDeviceType = createTestDeviceType({ slug: "new-device" });

    addDeviceTypeToLayout(layout, newDeviceType);

    expect(layout.device_types).toHaveLength(1);
  });

  it("throws error for duplicate slug", () => {
    const duplicateDeviceType = createTestDeviceType({
      slug: "existing-device",
    });

    expect(() => {
      addDeviceTypeToLayout(layout, duplicateDeviceType);
    }).toThrowError("Duplicate device type slug: existing-device");
  });

  it("adds to empty device_types array", () => {
    const emptyLayout = createTestLayout({ device_types: [] });
    const newDeviceType = createTestDeviceType({ slug: "first-device" });

    const result = addDeviceTypeToLayout(emptyLayout, newDeviceType);

    expect(result.device_types).toHaveLength(1);
    expect(result.device_types[0].slug).toBe("first-device");
  });

  it("preserves other layout properties", () => {
    const newDeviceType = createTestDeviceType({ slug: "new-device" });

    const result = addDeviceTypeToLayout(layout, newDeviceType);

    expect(result.name).toBe(layout.name);
    expect(result.version).toBe(layout.version);
    expect(result.racks[0]).toBe(layout.racks[0]);
    expect(result.settings).toBe(layout.settings);
  });
});

// =============================================================================
// removeDeviceTypeFromLayout Tests
// =============================================================================

describe("removeDeviceTypeFromLayout", () => {
  let layout: Layout;

  beforeEach(() => {
    layout = createTestLayout({
      device_types: [
        createTestDeviceType({ slug: "device-1" }),
        createTestDeviceType({ slug: "device-2" }),
        createTestDeviceType({ slug: "device-3" }),
      ],
      racks: [
        createTestRack({
          devices: [
            createTestDevice({ device_type: "device-1", position: 1 }),
            createTestDevice({ device_type: "device-2", position: 5 }),
            createTestDevice({ device_type: "device-1", position: 10 }), // Multiple instances
          ],
        }),
      ],
    });
  });

  it("removes device type by slug", () => {
    const result = removeDeviceTypeFromLayout(layout, "device-2");

    expect(result.device_types).toHaveLength(2);
    expect(
      result.device_types.find((dt) => dt.slug === "device-2"),
    ).toBeUndefined();
  });

  it("removes all placed devices referencing the device type", () => {
    const result = removeDeviceTypeFromLayout(layout, "device-1");

    expect(result.racks[0].devices).toHaveLength(1);
    expect(result.racks[0].devices[0].device_type).toBe("device-2");
  });

  it("returns a new layout object (immutable)", () => {
    const result = removeDeviceTypeFromLayout(layout, "device-1");

    expect(result).not.toBe(layout);
    expect(result.device_types).not.toBe(layout.device_types);
    expect(result.racks[0]).not.toBe(layout.racks[0]);
    expect(result.racks[0].devices).not.toBe(layout.racks[0].devices);
  });

  it("preserves original layout", () => {
    removeDeviceTypeFromLayout(layout, "device-1");

    expect(layout.device_types).toHaveLength(3);
    expect(layout.racks[0].devices).toHaveLength(3);
  });

  it("handles non-existent slug gracefully", () => {
    const result = removeDeviceTypeFromLayout(layout, "non-existent");

    expect(result.device_types).toHaveLength(3);
    expect(result.racks[0].devices).toHaveLength(3);
  });

  it("handles empty device_types array", () => {
    const emptyLayout = createTestLayout({ device_types: [] });

    const result = removeDeviceTypeFromLayout(emptyLayout, "anything");

    expect(result.device_types).toHaveLength(0);
  });

  it("preserves other layout properties", () => {
    const result = removeDeviceTypeFromLayout(layout, "device-1");

    expect(result.name).toBe(layout.name);
    expect(result.version).toBe(layout.version);
    expect(result.settings).toBe(layout.settings);
  });

  it("preserves rack properties except devices", () => {
    const result = removeDeviceTypeFromLayout(layout, "device-1");

    expect(result.racks[0].name).toBe(layout.racks[0].name);
    expect(result.racks[0].height).toBe(layout.racks[0].height);
    expect(result.racks[0].width).toBe(layout.racks[0].width);
  });
});

// =============================================================================
// placeDeviceInRack Tests
// =============================================================================

describe("placeDeviceInRack", () => {
  let layout: Layout;

  beforeEach(() => {
    layout = createTestLayout({
      device_types: [
        createTestDeviceType({ slug: "server-1" }),
        createTestDeviceType({ slug: "switch-1" }),
      ],
      racks: [
        createTestRack({
          devices: [
            createTestDevice({ device_type: "server-1", position: 10 }),
          ],
        }),
      ],
    });
  });

  it("places a device in the rack", () => {
    const device = createTestDevice({ device_type: "switch-1", position: 5 });

    const result = placeDeviceInRack(layout, device);

    expect(result.racks[0].devices).toHaveLength(2);
    expect(result.racks[0].devices[1]).toEqual(device);
  });

  it("returns a new layout object (immutable)", () => {
    const device = createTestDevice({ device_type: "switch-1", position: 5 });

    const result = placeDeviceInRack(layout, device);

    expect(result).not.toBe(layout);
    expect(result.racks[0]).not.toBe(layout.racks[0]);
    expect(result.racks[0].devices).not.toBe(layout.racks[0].devices);
  });

  it("preserves original layout", () => {
    const device = createTestDevice({ device_type: "switch-1", position: 5 });

    placeDeviceInRack(layout, device);

    expect(layout.racks[0].devices).toHaveLength(1);
  });

  it("throws error for non-existent device type", () => {
    const device = createTestDevice({
      device_type: "non-existent",
      position: 5,
    });

    expect(() => {
      placeDeviceInRack(layout, device);
    }).toThrowError("Device type not found: non-existent");
  });

  it("places device in empty rack", () => {
    const emptyLayout = createTestLayout({
      device_types: [createTestDeviceType({ slug: "device-1" })],
      racks: [createTestRack({ devices: [] })],
    });
    const device = createTestDevice({ device_type: "device-1", position: 1 });

    const result = placeDeviceInRack(emptyLayout, device);

    expect(result.racks[0].devices).toHaveLength(1);
  });

  it("preserves existing devices in rack", () => {
    const device = createTestDevice({ device_type: "switch-1", position: 5 });

    const result = placeDeviceInRack(layout, device);

    expect(result.racks[0].devices[0]).toEqual(layout.racks[0].devices[0]);
  });

  it("preserves other layout properties", () => {
    const device = createTestDevice({ device_type: "switch-1", position: 5 });

    const result = placeDeviceInRack(layout, device);

    expect(result.name).toBe(layout.name);
    expect(result.version).toBe(layout.version);
    expect(result.device_types).toBe(layout.device_types);
    expect(result.settings).toBe(layout.settings);
  });
});

// =============================================================================
// removeDeviceFromRack Tests
// =============================================================================

describe("removeDeviceFromRack", () => {
  let layout: Layout;

  beforeEach(() => {
    layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [
            createTestDevice({ device_type: "device-1", position: 1 }),
            createTestDevice({ device_type: "device-2", position: 5 }),
            createTestDevice({ device_type: "device-3", position: 10 }),
          ],
        }),
      ],
    });
  });

  it("removes device at index", () => {
    const result = removeDeviceFromRack(layout, 1);

    expect(result.racks[0].devices).toHaveLength(2);
    expect(result.racks[0].devices[0].device_type).toBe("device-1");
    expect(result.racks[0].devices[1].device_type).toBe("device-3");
  });

  it("removes first device", () => {
    const result = removeDeviceFromRack(layout, 0);

    expect(result.racks[0].devices).toHaveLength(2);
    expect(result.racks[0].devices[0].device_type).toBe("device-2");
  });

  it("removes last device", () => {
    const result = removeDeviceFromRack(layout, 2);

    expect(result.racks[0].devices).toHaveLength(2);
    expect(result.racks[0].devices[1].device_type).toBe("device-2");
  });

  it("returns a new layout object (immutable)", () => {
    const result = removeDeviceFromRack(layout, 1);

    expect(result).not.toBe(layout);
    expect(result.racks[0]).not.toBe(layout.racks[0]);
    expect(result.racks[0].devices).not.toBe(layout.racks[0].devices);
  });

  it("preserves original layout", () => {
    removeDeviceFromRack(layout, 1);

    expect(layout.racks[0].devices).toHaveLength(3);
  });

  it("returns same layout for negative index", () => {
    const result = removeDeviceFromRack(layout, -1);

    expect(result).toBe(layout);
    expect(result.racks[0].devices).toHaveLength(3);
  });

  it("returns same layout for out-of-bounds index", () => {
    const result = removeDeviceFromRack(layout, 100);

    expect(result).toBe(layout);
    expect(result.racks[0].devices).toHaveLength(3);
  });

  it("returns same layout for index equal to length", () => {
    const result = removeDeviceFromRack(layout, 3);

    expect(result).toBe(layout);
  });

  it("handles empty devices array gracefully", () => {
    const emptyLayout = createTestLayout({
      racks: [createTestRack({ devices: [] })],
    });

    const result = removeDeviceFromRack(emptyLayout, 0);

    expect(result).toBe(emptyLayout);
  });

  it("preserves other rack properties", () => {
    const result = removeDeviceFromRack(layout, 1);

    expect(result.racks[0].name).toBe(layout.racks[0].name);
    expect(result.racks[0].height).toBe(layout.racks[0].height);
    expect(result.racks[0].width).toBe(layout.racks[0].width);
  });

  it("preserves other layout properties", () => {
    const result = removeDeviceFromRack(layout, 1);

    expect(result.name).toBe(layout.name);
    expect(result.version).toBe(layout.version);
    expect(result.device_types).toBe(layout.device_types);
    expect(result.settings).toBe(layout.settings);
  });

  it("handles removing only device", () => {
    const singleDeviceLayout = createTestLayout({
      racks: [
        createTestRack({
          devices: [
            createTestDevice({ device_type: "only-device", position: 1 }),
          ],
        }),
      ],
    });

    const result = removeDeviceFromRack(singleDeviceLayout, 0);

    expect(result.racks[0].devices).toHaveLength(0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("layout-helpers integration", () => {
  it("creates device type, adds to layout, places device, then removes all", () => {
    // Start with empty layout
    let layout = createTestLayout({
      device_types: [],
      racks: [createTestRack({ devices: [] })],
    });

    // Create and add a device type
    const deviceType = createDeviceType({
      name: "Test Server",
      u_height: 2,
      category: "server",
      colour: "#336699",
    });
    layout = addDeviceTypeToLayout(layout, deviceType);

    expect(layout.device_types).toHaveLength(1);

    // Place a device
    const device = createDevice(deviceType.slug, 10, "front", "My Server");
    layout = placeDeviceInRack(layout, device);

    expect(layout.racks[0].devices).toHaveLength(1);

    // Verify display name
    const displayName = getDeviceDisplayName(
      layout.racks[0].devices[0],
      layout.device_types,
    );
    expect(displayName).toBe("My Server");

    // Remove device type (should also remove placed device)
    layout = removeDeviceTypeFromLayout(layout, deviceType.slug);

    expect(layout.device_types).toHaveLength(0);
    expect(layout.racks[0].devices).toHaveLength(0);
  });

  it("handles multiple device types and placements", () => {
    let layout = createTestLayout({
      device_types: [],
      racks: [createTestRack({ devices: [] })],
    });

    // Add multiple device types
    const server = createDeviceType({
      name: "Server",
      u_height: 2,
      category: "server",
      colour: "#336699",
    });
    const switch1 = createDeviceType({
      name: "Switch",
      u_height: 1,
      category: "network",
      colour: "#50FA7B",
    });

    layout = addDeviceTypeToLayout(layout, server);
    layout = addDeviceTypeToLayout(layout, switch1);

    expect(layout.device_types).toHaveLength(2);

    // Place multiple devices
    layout = placeDeviceInRack(layout, createDevice(server.slug, 10, "front"));
    layout = placeDeviceInRack(layout, createDevice(switch1.slug, 5, "front"));
    layout = placeDeviceInRack(layout, createDevice(server.slug, 20, "front"));

    expect(layout.racks[0].devices).toHaveLength(3);

    // Remove one device type
    layout = removeDeviceTypeFromLayout(layout, server.slug);

    // Only switch device should remain
    expect(layout.device_types).toHaveLength(1);
    expect(layout.racks[0].devices).toHaveLength(1);
    expect(layout.racks[0].devices[0].device_type).toBe(switch1.slug);
  });
});
