/**
 * Schema Validation Tests
 * Comprehensive tests for Zod validation schemas
 */

import { describe, it, expect } from "vitest";
import {
  SlugSchema,
  DeviceCategorySchema,
  FormFactorSchema,
  DeviceFaceSchema,
  WeightUnitSchema,
  DisplayModeSchema,
  DeviceTypeSchema,
  PlacedDeviceSchema,
  RackSchema,
  RackGroupSchema,
  LayoutSettingsSchema,
  LayoutSchema,
  validateSlugUniqueness,
  SlotSchema,
  SlotPosition2DSchema,
} from "$lib/schemas";
import {
  createTestContainerType,
  createTestSlot,
  createTestDevice,
  createTestContainerChild,
  createTestDeviceType,
  createTestRack,
  createTestLayoutSettings,
} from "./factories";
import { VERSION } from "$lib/version";

// ============================================================================
// SlugSchema Tests
// ============================================================================

describe("SlugSchema", () => {
  describe("valid slugs", () => {
    it("accepts simple lowercase slug", () => {
      expect(SlugSchema.safeParse("server").success).toBe(true);
    });

    it("accepts slug with numbers", () => {
      expect(SlugSchema.safeParse("server1").success).toBe(true);
    });

    it("accepts slug with hyphens", () => {
      expect(SlugSchema.safeParse("dell-r740").success).toBe(true);
    });

    it("accepts multi-hyphen slug", () => {
      expect(SlugSchema.safeParse("dell-poweredge-r740").success).toBe(true);
    });

    it("accepts single character slug", () => {
      expect(SlugSchema.safeParse("a").success).toBe(true);
    });

    it("accepts 100 character slug", () => {
      const slug = "a".repeat(100);
      expect(SlugSchema.safeParse(slug).success).toBe(true);
    });
  });

  describe("invalid slugs", () => {
    it("rejects empty string", () => {
      const result = SlugSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects uppercase letters", () => {
      const result = SlugSchema.safeParse("Server");
      expect(result.success).toBe(false);
    });

    it("rejects leading hyphen", () => {
      const result = SlugSchema.safeParse("-server");
      expect(result.success).toBe(false);
    });

    it("rejects trailing hyphen", () => {
      const result = SlugSchema.safeParse("server-");
      expect(result.success).toBe(false);
    });

    it("rejects consecutive hyphens", () => {
      const result = SlugSchema.safeParse("server--rack");
      expect(result.success).toBe(false);
    });

    it("rejects spaces", () => {
      const result = SlugSchema.safeParse("my server");
      expect(result.success).toBe(false);
    });

    it("rejects special characters", () => {
      const result = SlugSchema.safeParse("server_rack");
      expect(result.success).toBe(false);
    });

    it("rejects slug over 100 characters", () => {
      const slug = "a".repeat(101);
      const result = SlugSchema.safeParse(slug);
      expect(result.success).toBe(false);
    });
  });

  describe("error messages", () => {
    it("shows required message for empty slug", () => {
      const result = SlugSchema.safeParse("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("required");
      }
    });

    it("shows pattern message for invalid format", () => {
      const result = SlugSchema.safeParse("UPPERCASE");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("lowercase");
      }
    });
  });
});

// ============================================================================
// Enum Schema Tests
// ============================================================================

describe("DeviceCategorySchema", () => {
  const validCategories = [
    "server",
    "network",
    "patch-panel",
    "power",
    "storage",
    "kvm",
    "av-media",
    "cooling",
    "shelf",
    "blank",
    "cable-management",
    "other",
  ];

  it.each(validCategories)("accepts valid category: %s", (category) => {
    expect(DeviceCategorySchema.safeParse(category).success).toBe(true);
  });

  it("rejects invalid category", () => {
    expect(DeviceCategorySchema.safeParse("invalid").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(DeviceCategorySchema.safeParse("").success).toBe(false);
  });
});

describe("FormFactorSchema", () => {
  const validFormFactors = [
    "2-post",
    "4-post",
    "4-post-cabinet",
    "wall-mount",
    "open-frame",
  ];

  it.each(validFormFactors)("accepts valid form factor: %s", (formFactor) => {
    expect(FormFactorSchema.safeParse(formFactor).success).toBe(true);
  });

  it("rejects invalid form factor", () => {
    expect(FormFactorSchema.safeParse("invalid").success).toBe(false);
  });
});

describe("DeviceFaceSchema", () => {
  it("accepts front", () => {
    expect(DeviceFaceSchema.safeParse("front").success).toBe(true);
  });

  it("accepts rear", () => {
    expect(DeviceFaceSchema.safeParse("rear").success).toBe(true);
  });

  it("accepts both", () => {
    expect(DeviceFaceSchema.safeParse("both").success).toBe(true);
  });

  it("rejects invalid face", () => {
    expect(DeviceFaceSchema.safeParse("side").success).toBe(false);
  });
});

describe("WeightUnitSchema", () => {
  it("accepts kg", () => {
    expect(WeightUnitSchema.safeParse("kg").success).toBe(true);
  });

  it("accepts lb", () => {
    expect(WeightUnitSchema.safeParse("lb").success).toBe(true);
  });

  it("rejects invalid unit", () => {
    expect(WeightUnitSchema.safeParse("oz").success).toBe(false);
  });
});

describe("DisplayModeSchema", () => {
  it("accepts label", () => {
    expect(DisplayModeSchema.safeParse("label").success).toBe(true);
  });

  it("accepts image", () => {
    expect(DisplayModeSchema.safeParse("image").success).toBe(true);
  });

  it("rejects invalid mode", () => {
    expect(DisplayModeSchema.safeParse("both").success).toBe(false);
  });
});

// ============================================================================
// Colour Validation Tests (flat structure in v1.0.0)
// ============================================================================

describe("DeviceTypeSchema colour validation", () => {
  const baseDevice = {
    slug: "test-device",
    u_height: 1,
    category: "server" as const,
  };

  it("accepts valid hex colour", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#FF5733",
    });
    expect(result.success).toBe(true);
  });

  it("accepts lowercase hex colour", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#ff5733",
    });
    expect(result.success).toBe(true);
  });

  it("rejects colour without hash", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "FF5733",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 3-character hex", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#F00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 8-character hex (with alpha)", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#FF5733FF",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex characters", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#GGGGGG",
    });
    expect(result.success).toBe(false);
  });
});

describe("DeviceTypeSchema", () => {
  // Schema v1.0.0: Flat structure with colour and category at top level
  const validBaseDevice = {
    slug: "test-device",
    u_height: 1,
    colour: "#4A90D9",
    category: "server" as const,
  };

  describe("power device properties", () => {
    it("validates device type without power fields", () => {
      const result = DeviceTypeSchema.safeParse(validBaseDevice);
      expect(result.success).toBe(true);
    });

    it("validates device type with valid va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 1500,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.va_rating).toBe(1500);
      }
    });

    it("validates device type with power_outlets array", () => {
      const device = {
        ...validBaseDevice,
        power_outlets: [
          { name: "Outlet 1", type: "iec-c13" },
          { name: "Outlet 2", type: "iec-c13" },
        ],
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: schema should preserve input array length
        expect(result.data.power_outlets).toHaveLength(2);
      }
    });

    it("validates device type with power_ports and va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 3000,
        power_ports: [
          { name: "PSU1", maximum_draw: 500 },
          { name: "PSU2", maximum_draw: 500 },
        ],
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: schema should preserve input array length
        expect(result.data.power_ports).toHaveLength(2);
        expect(result.data.va_rating).toBe(3000);
      }
    });

    it("rejects negative va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: -500,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(false);
    });

    it("rejects non-integer va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 1500.5,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(false);
    });

    it("rejects zero va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 0,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(false);
    });
  });

  describe("existing field validation", () => {
    it("validates device type with all optional fields", () => {
      // Schema v1.0.0: Flat structure with all fields at top level
      const device = {
        slug: "full-device",
        u_height: 2,
        manufacturer: "Test Mfg",
        model: "Model X",
        is_full_depth: true,
        weight: 25.5,
        weight_unit: "kg" as const,
        notes: "Test notes",
        va_rating: 1500,
        colour: "#4A90D9",
        category: "power" as const,
        tags: ["test"],
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
    });
  });

  describe("u_height validation", () => {
    it("accepts 0.5U height", () => {
      const device = { ...validBaseDevice, u_height: 0.5 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
    });

    it("accepts 1.5U height", () => {
      const device = { ...validBaseDevice, u_height: 1.5 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
    });

    it("accepts 50U height (max)", () => {
      const device = { ...validBaseDevice, u_height: 50 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
    });

    it("rejects height less than 0.5U", () => {
      const device = { ...validBaseDevice, u_height: 0.25 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects height greater than 50U", () => {
      const device = { ...validBaseDevice, u_height: 51 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects non-0.5U multiple height", () => {
      const device = { ...validBaseDevice, u_height: 1.3 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects zero height", () => {
      const device = { ...validBaseDevice, u_height: 0 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects negative height", () => {
      const device = { ...validBaseDevice, u_height: -1 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });
  });

  describe("required fields", () => {
    it("rejects missing slug", () => {
      const device = {
        u_height: 1,
        colour: "#4A90D9",
        category: "server",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects missing u_height", () => {
      const device = {
        slug: "test-device",
        colour: "#4A90D9",
        category: "server",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects missing colour", () => {
      const device = {
        slug: "test-device",
        u_height: 1,
        category: "server",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects missing category", () => {
      const device = {
        slug: "test-device",
        u_height: 1,
        colour: "#4A90D9",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });
  });
});

// ============================================================================
// PlacedDeviceSchema Tests
// ============================================================================

describe("PlacedDeviceSchema", () => {
  // Schema v1.0.0: PlacedDevice requires id field
  const validPlacedDevice = {
    id: "test-id-123",
    device_type: "test-device",
    position: 1,
    face: "front" as const,
  };

  describe("valid placed devices", () => {
    it("accepts minimal valid placed device", () => {
      expect(PlacedDeviceSchema.safeParse(validPlacedDevice).success).toBe(
        true,
      );
    });

    it("accepts placed device with optional name", () => {
      const device = { ...validPlacedDevice, name: "Web Server 1" };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts rear face", () => {
      const device = { ...validPlacedDevice, face: "rear" as const };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts both face", () => {
      const device = { ...validPlacedDevice, face: "both" as const };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });
  });

  describe("position validation", () => {
    it("accepts position 1", () => {
      const device = { ...validPlacedDevice, position: 1 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts high position numbers", () => {
      const device = { ...validPlacedDevice, position: 42 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("rejects position 0", () => {
      const device = { ...validPlacedDevice, position: 0 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });

    it("rejects negative position", () => {
      const device = { ...validPlacedDevice, position: -1 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });

    it("rejects non-integer position", () => {
      const device = { ...validPlacedDevice, position: 1.5 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("accepts empty name", () => {
      const device = { ...validPlacedDevice, name: "" };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts name with 100 characters", () => {
      const device = { ...validPlacedDevice, name: "a".repeat(100) };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("rejects name over 100 characters", () => {
      const device = { ...validPlacedDevice, name: "a".repeat(101) };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });
  });
});

// ============================================================================
// RackSchema Tests
// ============================================================================

describe("RackSchema", () => {
  const validRack = {
    id: "rack-1",
    name: "Main Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  describe("valid racks", () => {
    it("accepts minimal valid rack", () => {
      expect(RackSchema.safeParse(validRack).success).toBe(true);
    });

    it("accepts 10-inch rack", () => {
      const rack = { ...validRack, width: 10 as const };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("accepts rack with devices", () => {
      const rack = {
        ...validRack,
        devices: [
          {
            id: "device-1",
            device_type: "server",
            position: 1,
            face: "front" as const,
          },
        ],
      };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("accepts desc_units true", () => {
      const rack = { ...validRack, desc_units: true };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });
  });

  describe("height validation", () => {
    it("accepts 1U rack (min)", () => {
      const rack = { ...validRack, height: 1 };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("accepts 50U rack (within allowed range)", () => {
      const rack = { ...validRack, height: 50 };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("rejects 0U rack", () => {
      const rack = { ...validRack, height: 0 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects 101U rack", () => {
      // Schema v1.0.0: Max rack height is 100U
      const rack = { ...validRack, height: 101 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects non-integer height", () => {
      const rack = { ...validRack, height: 42.5 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });

  describe("width validation", () => {
    it("rejects invalid width", () => {
      const rack = { ...validRack, width: 15 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("rejects empty name", () => {
      const rack = { ...validRack, name: "" };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects name over 100 characters", () => {
      const rack = { ...validRack, name: "a".repeat(101) };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });
});

// ============================================================================
// LayoutSettingsSchema Tests
// ============================================================================

describe("LayoutSettingsSchema", () => {
  it("accepts valid settings", () => {
    const settings = {
      display_mode: "label" as const,
      show_labels_on_images: true,
    };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it("accepts image display mode", () => {
    const settings = {
      display_mode: "image" as const,
      show_labels_on_images: false,
    };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it("rejects missing display_mode", () => {
    const settings = { show_labels_on_images: true };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("rejects missing show_labels_on_images", () => {
    const settings = { display_mode: "label" };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(false);
  });
});

// ============================================================================
// LayoutSchema Tests
// ============================================================================

describe("LayoutSchema", () => {
  const validLayout = {
    version: "0.2.0",
    name: "My Homelab",
    racks: [
      {
        id: "rack-1",
        name: "Main Rack",
        height: 42,
        width: 19 as const,
        desc_units: false,
        form_factor: "4-post-cabinet" as const,
        starting_unit: 1,
        position: 0,
        devices: [],
      },
    ],
    device_types: [],
    settings: {
      display_mode: "label" as const,
      show_labels_on_images: true,
    },
  };

  describe("valid layouts", () => {
    it("accepts minimal valid layout", () => {
      expect(LayoutSchema.safeParse(validLayout).success).toBe(true);
    });

    it("accepts layout with device types", () => {
      // Schema v1.0.0: Flat structure with colour and category at top level
      const layout = {
        ...validLayout,
        device_types: [
          {
            slug: "dell-r740",
            u_height: 2,
            colour: "#4A90D9",
            category: "server" as const,
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("accepts layout with multiple device types", () => {
      const layout = {
        ...validLayout,
        device_types: [
          {
            slug: "server-1",
            u_height: 2,
            colour: "#4A90D9",
            category: "server" as const,
          },
          {
            slug: "switch-1",
            u_height: 1,
            colour: "#FF5733",
            category: "network" as const,
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("slug uniqueness validation", () => {
    it("rejects duplicate device type slugs", () => {
      const layout = {
        ...validLayout,
        device_types: [
          {
            slug: "duplicate-slug",
            u_height: 2,
            colour: "#4A90D9",
            category: "server" as const,
          },
          {
            slug: "duplicate-slug",
            u_height: 1,
            colour: "#FF5733",
            category: "network" as const,
          },
        ],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Duplicate");
      }
    });

    it("allows empty device_types", () => {
      const layout = { ...validLayout, device_types: [] };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("name validation", () => {
    it("rejects empty layout name", () => {
      const layout = { ...validLayout, name: "" };
      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });

    it("rejects layout name over 100 characters", () => {
      const layout = { ...validLayout, name: "a".repeat(101) };
      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });
  });
});

// ============================================================================
// RackGroupSchema Tests (Multi-rack support)
// ============================================================================

describe("RackGroupSchema", () => {
  const validRackGroup = {
    id: "group-1",
    name: "Touring Rack",
    rack_ids: ["rack-1", "rack-2", "rack-3"],
    layout_preset: "bayed" as const,
  };

  describe("valid rack groups", () => {
    it("accepts minimal valid rack group (id + rack_ids only)", () => {
      const group = { id: "group-1", rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts rack group with all fields", () => {
      expect(RackGroupSchema.safeParse(validRackGroup).success).toBe(true);
    });

    it("accepts bayed layout preset", () => {
      const group = { ...validRackGroup, layout_preset: "bayed" as const };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts row layout preset", () => {
      const group = { ...validRackGroup, layout_preset: "row" as const };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts rack group without optional name", () => {
      const group = { id: "group-1", rack_ids: ["rack-1", "rack-2"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts rack group without optional layout_preset", () => {
      const group = { id: "group-1", name: "Test Group", rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });
  });

  describe("id validation", () => {
    it("rejects missing id", () => {
      const group = { rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });

    it("rejects empty id", () => {
      const group = { id: "", rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });
  });

  describe("rack_ids validation", () => {
    it("rejects missing rack_ids", () => {
      const group = { id: "group-1" };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });

    it("rejects empty rack_ids array", () => {
      const group = { id: "group-1", rack_ids: [] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });

    it("rejects rack_ids with empty strings", () => {
      const group = { id: "group-1", rack_ids: ["rack-1", ""] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });
  });

  describe("layout_preset validation", () => {
    it("rejects invalid layout preset", () => {
      const group = { ...validRackGroup, layout_preset: "invalid" };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });
  });
});

// ============================================================================
// Multi-rack LayoutSchema Tests
// ============================================================================

describe("LayoutSchema multi-rack support", () => {
  const validRack = {
    id: "rack-1",
    name: "Main Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  const validMultiRackLayout = {
    version: "0.6.0",
    name: "Multi-Rack Homelab",
    racks: [validRack],
    device_types: [],
    settings: {
      display_mode: "label" as const,
      show_labels_on_images: true,
    },
  };

  describe("racks array validation", () => {
    it("accepts layout with single rack in array", () => {
      expect(LayoutSchema.safeParse(validMultiRackLayout).success).toBe(true);
    });

    it("accepts layout with multiple racks", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [
          validRack,
          { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
          { ...validRack, id: "rack-3", name: "Rack 3", position: 2 },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("rejects layout with empty racks array", () => {
      const layout = { ...validMultiRackLayout, racks: [] };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "At least one rack is required",
        );
      }
    });

    it("generates id for racks missing required id (migration)", () => {
      // After #472: racks without id get nanoid generated
      const rackWithoutId = { ...validRack };
      delete (rackWithoutId as Record<string, unknown>).id;
      const layout = {
        ...validMultiRackLayout,
        racks: [rackWithoutId],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBeDefined();
        expect(result.data.racks[0]!.id.length).toBe(21); // nanoid length
      }
    });
  });

  describe("rack_groups validation", () => {
    it("accepts layout with rack_groups", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [
          validRack,
          { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
        ],
        rack_groups: [
          {
            id: "group-1",
            name: "Touring Rack",
            rack_ids: ["rack-1", "rack-2"],
            layout_preset: "bayed" as const,
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("accepts layout without rack_groups (optional)", () => {
      const layout = { ...validMultiRackLayout };
      delete (layout as Record<string, unknown>).rack_groups;
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("accepts layout with empty rack_groups array", () => {
      const layout = { ...validMultiRackLayout, rack_groups: [] };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("rejects rack_groups with non-existent rack_ids", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [validRack],
        rack_groups: [
          {
            id: "group-1",
            name: "Invalid Group",
            rack_ids: ["rack-1", "non-existent-rack"],
          },
        ],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "non-existent rack IDs",
        );
      }
    });

    it("accepts rack_groups with all valid rack_ids", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [
          validRack,
          { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
          { ...validRack, id: "rack-3", name: "Rack 3", position: 2 },
        ],
        rack_groups: [
          {
            id: "group-1",
            name: "Valid Group",
            rack_ids: ["rack-1", "rack-3"],
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("backward compatibility with single rack format", () => {
    // After #472: Schema now auto-migrates legacy format via transform
    it("auto-migrates old single-rack format (rack to racks[])", () => {
      const oldLayout = {
        version: "0.5.0",
        name: "Old Homelab",
        rack: validRack, // Old format
        device_types: [],
        settings: {
          display_mode: "label" as const,
          show_labels_on_images: true,
        },
      };
      // Schema now handles migration via transform
      const result = LayoutSchema.safeParse(oldLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks).toBeDefined();
        expect(result.data.racks[0]!.name).toBe("Main Rack");
      }
    });
  });
});

// ============================================================================
// RackSchema multi-rack changes (id required)
// ============================================================================

describe("RackSchema multi-rack changes", () => {
  const validRackWithId = {
    id: "rack-1",
    name: "Main Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  it("requires id field", () => {
    const rackWithoutId = { ...validRackWithId };
    delete (rackWithoutId as Record<string, unknown>).id;
    expect(RackSchema.safeParse(rackWithoutId).success).toBe(false);
  });

  it("accepts rack with valid id", () => {
    expect(RackSchema.safeParse(validRackWithId).success).toBe(true);
  });

  it("rejects rack with empty id", () => {
    const rack = { ...validRackWithId, id: "" };
    expect(RackSchema.safeParse(rack).success).toBe(false);
  });
});

// ============================================================================
// validateSlugUniqueness Tests
// ============================================================================

describe("validateSlugUniqueness", () => {
  it("returns empty array for unique slugs", () => {
    const types = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
    expect(validateSlugUniqueness(types)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(validateSlugUniqueness([])).toEqual([]);
  });

  it("returns duplicate slug when found", () => {
    const types = [{ slug: "a" }, { slug: "b" }, { slug: "a" }];
    expect(validateSlugUniqueness(types)).toEqual(["a"]);
  });

  it("returns all duplicate slugs", () => {
    const types = [
      { slug: "a" },
      { slug: "b" },
      { slug: "a" },
      { slug: "b" },
      { slug: "c" },
    ];
    const result = validateSlugUniqueness(types);
    expect(result).toContain("a");
    expect(result).toContain("b");
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: deduplication should return exactly 2 duplicate slugs
    expect(result).toHaveLength(2);
  });

  it("handles single item", () => {
    expect(validateSlugUniqueness([{ slug: "a" }])).toEqual([]);
  });
});

// ============================================================================
// Container Schema Tests (v0.6.0)
// ============================================================================

describe("SlotPosition2DSchema", () => {
  it("accepts valid position", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 0, col: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts non-zero position", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 2, col: 3 });
    expect(result.success).toBe(true);
  });

  it("rejects negative row", () => {
    const result = SlotPosition2DSchema.safeParse({ row: -1, col: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative col", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 0, col: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer row", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 1.5, col: 0 });
    expect(result.success).toBe(false);
  });
});

describe("SlotSchema", () => {
  describe("valid slots", () => {
    it("accepts minimal valid slot", () => {
      const slot = { id: "slot-1", position: { row: 0, col: 0 } };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("accepts slot with all optional fields", () => {
      const slot = {
        id: "bay-1",
        name: "Left Bay",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
        accepts: ["server", "storage"],
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("accepts slot with factory helper", () => {
      const slot = createTestSlot({ id: "test-slot" });
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });
  });

  describe("id validation", () => {
    it("rejects empty id", () => {
      const slot = { id: "", position: { row: 0, col: 0 } };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects missing id", () => {
      const slot = { position: { row: 0, col: 0 } };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });

  describe("width_fraction validation", () => {
    it("accepts 0.5 width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("accepts 1 width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 1,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("rejects width fraction > 1", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 1.5,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects negative width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: -0.5,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects zero width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 0,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });

  describe("height_units validation", () => {
    it("accepts valid height units", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        height_units: 2,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("rejects height_units > 50", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        height_units: 51,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects negative height_units", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        height_units: -1,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });

  describe("accepts validation", () => {
    it("accepts valid device categories", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        accepts: ["server", "storage", "network"],
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("rejects invalid device category", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        accepts: ["invalid-category"],
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });
});

describe("DeviceTypeSchema container support", () => {
  it("accepts device type with slots (container)", () => {
    const containerType = createTestContainerType();
    const result = DeviceTypeSchema.safeParse(containerType);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slots).toBeDefined();
      expect(result.data.slots?.length).toBeGreaterThan(0);
    }
  });

  it("accepts device type without slots (non-container)", () => {
    const normalType = createTestDeviceType({ slug: "normal-device" });
    const result = DeviceTypeSchema.safeParse(normalType);
    expect(result.success).toBe(true);
  });

  it("accepts device type with empty slots array (non-container)", () => {
    const type = { ...createTestDeviceType(), slots: [] };
    const result = DeviceTypeSchema.safeParse(type);
    expect(result.success).toBe(true);
  });
});

describe("PlacedDeviceSchema container child support", () => {
  describe("container_id and slot_id validation", () => {
    it("accepts device with container_id and slot_id", () => {
      const child = createTestContainerChild({
        container_id: "container-1",
        slot_id: "slot-left",
      });
      const result = PlacedDeviceSchema.safeParse(child);
      expect(result.success).toBe(true);
    });

    it("rejects device with container_id but no slot_id", () => {
      const device = {
        id: "child-1",
        device_type: "test-device",
        position: 0,
        face: "front",
        container_id: "container-1",
        // slot_id is missing
      };
      const result = PlacedDeviceSchema.safeParse(device);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "slot_id is required",
        );
      }
    });

    it("accepts device without container_id or slot_id (rack-level)", () => {
      const device = createTestDevice({ position: 1 });
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });
  });

  describe("position validation with container context", () => {
    it("accepts position 0 for container children", () => {
      const child = createTestContainerChild({
        container_id: "container-1",
        slot_id: "slot-left",
        position: 0,
      });
      expect(PlacedDeviceSchema.safeParse(child).success).toBe(true);
    });

    it("rejects position 0 for rack-level devices", () => {
      const device = {
        id: "device-1",
        device_type: "test-device",
        position: 0,
        face: "front",
        // No container_id = rack-level device
      };
      const result = PlacedDeviceSchema.safeParse(device);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("at least 1");
      }
    });
  });
});

// ============================================================================
// Multi-rack Migration and Validation Tests (#472)
// ============================================================================

describe("LayoutSchema legacy migration", () => {
  const legacyRack = {
    name: "Legacy Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  describe("legacy rack to racks[] migration", () => {
    it("auto-migrates Layout.rack to Layout.racks[0]", () => {
      const legacyLayout = {
        version: "0.5.0",
        name: "Legacy Homelab",
        rack: legacyRack,
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(legacyLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks).toBeDefined();
        expect(result.data.racks.length).toBe(1);
        expect(result.data.racks[0]!.name).toBe("Legacy Rack");
        // Legacy 'rack' field should be removed from output
        expect("rack" in result.data).toBe(false);
      }
    });

    it("generates nanoid for rack without id during migration", () => {
      const legacyLayout = {
        version: "0.5.0",
        name: "Legacy Homelab",
        rack: legacyRack, // No id field
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(legacyLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBeDefined();
        expect(result.data.racks[0]!.id.length).toBe(21); // nanoid length
      }
    });

    it("preserves existing rack id during migration", () => {
      const legacyLayoutWithId = {
        version: "0.5.0",
        name: "Legacy Homelab",
        rack: { ...legacyRack, id: "existing-id" },
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(legacyLayoutWithId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBe("existing-id");
      }
    });

    it("prefers racks[] over legacy rack if both present", () => {
      const modernRack = {
        ...legacyRack,
        id: "rack-modern",
        name: "Modern Rack",
      };
      const layoutWithBoth = {
        version: "0.6.0",
        name: "Mixed Format",
        rack: legacyRack, // Should be ignored
        racks: [modernRack],
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(layoutWithBoth);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks.length).toBe(1);
        expect(result.data.racks[0]!.name).toBe("Modern Rack");
      }
    });
  });

  describe("rack id generation for racks[] without ids", () => {
    it("generates ids for racks missing id field", () => {
      const layout = {
        version: "0.6.0",
        name: "Multi-rack Layout",
        racks: [
          { ...legacyRack, name: "Rack 1" }, // No id
          { ...legacyRack, name: "Rack 2" }, // No id
        ],
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id.length).toBe(21);
        expect(result.data.racks[1]!.id.length).toBe(21);
        // IDs should be unique
        expect(result.data.racks[0]!.id).not.toBe(result.data.racks[1]!.id);
      }
    });

    it("preserves existing ids while generating missing ones", () => {
      const layout = {
        version: "0.6.0",
        name: "Mixed ID Layout",
        racks: [
          { ...legacyRack, id: "has-id", name: "Rack 1" },
          { ...legacyRack, name: "Rack 2" }, // No id
        ],
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBe("has-id");
        expect(result.data.racks[1]!.id.length).toBe(21);
      }
    });
  });
});

describe("LayoutSchema rack ID uniqueness validation", () => {
  const validRack = {
    id: "rack-1",
    name: "Rack 1",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  it("rejects duplicate rack IDs", () => {
    const layout = {
      version: "0.6.0",
      name: "Duplicate ID Layout",
      racks: [
        { ...validRack, id: "duplicate-id", name: "Rack 1" },
        { ...validRack, id: "duplicate-id", name: "Rack 2", position: 1 },
      ],
      device_types: [],
      settings: baseSettings,
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Duplicate rack IDs");
    }
  });

  it("accepts unique rack IDs", () => {
    const layout = {
      version: "0.6.0",
      name: "Unique ID Layout",
      racks: [
        { ...validRack, id: "rack-1", name: "Rack 1" },
        { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
        { ...validRack, id: "rack-3", name: "Rack 3", position: 2 },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });
});

describe("LayoutSchema bayed group height validation", () => {
  const createRack = (id: string, height: number, position: number) => ({
    id,
    name: `Rack ${id}`,
    height,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position,
    devices: [],
  });

  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  it("rejects bayed group with mixed-height racks", () => {
    const layout = {
      version: "0.6.0",
      name: "Mixed Height Bayed",
      racks: [
        createRack("rack-1", 12, 0), // 12U
        createRack("rack-2", 20, 1), // 20U - different height
      ],
      rack_groups: [
        {
          id: "group-1",
          name: "Touring Rack",
          rack_ids: ["rack-1", "rack-2"],
          layout_preset: "bayed" as const,
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("same height");
    }
  });

  it("accepts bayed group with same-height racks", () => {
    const layout = {
      version: "0.6.0",
      name: "Same Height Bayed",
      racks: [
        createRack("rack-1", 12, 0),
        createRack("rack-2", 12, 1),
        createRack("rack-3", 12, 2),
      ],
      rack_groups: [
        {
          id: "group-1",
          name: "Touring Rack",
          rack_ids: ["rack-1", "rack-2", "rack-3"],
          layout_preset: "bayed" as const,
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("allows mixed heights in non-bayed groups (row preset)", () => {
    const layout = {
      version: "0.6.0",
      name: "Mixed Height Row",
      racks: [createRack("rack-1", 12, 0), createRack("rack-2", 42, 1)],
      rack_groups: [
        {
          id: "group-1",
          name: "Row Group",
          rack_ids: ["rack-1", "rack-2"],
          layout_preset: "row" as const,
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("allows mixed heights in groups without layout_preset", () => {
    const layout = {
      version: "0.6.0",
      name: "Mixed Height Default",
      racks: [createRack("rack-1", 12, 0), createRack("rack-2", 42, 1)],
      rack_groups: [
        {
          id: "group-1",
          name: "Default Group",
          rack_ids: ["rack-1", "rack-2"],
          // No layout_preset
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });
});

describe("LayoutSchema container validation", () => {
  const createValidLayout = () => ({
    version: "0.6.0",
    name: "Container Test Layout",
    racks: [
      {
        id: "rack-1",
        name: "Test Rack",
        height: 42,
        width: 19 as const,
        desc_units: false,
        show_rear: true,
        form_factor: "4-post" as const,
        starting_unit: 1,
        position: 0,
        devices: [],
      },
    ],
    device_types: [],
    settings: {
      display_mode: "label" as const,
      show_labels_on_images: false,
    },
  });

  describe("container_id references", () => {
    it("accepts valid container child relationship", () => {
      const containerType = createTestContainerType({ slug: "blade-chassis" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [containerType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "container-1",
                device_type: "blade-chassis",
                position: 10,
                face: "front" as const,
              },
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "container-1",
                slot_id: "slot-left",
              },
            ],
          },
        ],
      };

      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("rejects container_id referencing non-existent device", () => {
      const containerType = createTestContainerType({ slug: "blade-chassis" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [containerType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "non-existent-container",
                slot_id: "slot-left",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "non-existent container",
        );
      }
    });
  });

  describe("slot_id validation", () => {
    it("rejects invalid slot_id in container", () => {
      const containerType = createTestContainerType({ slug: "blade-chassis" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [containerType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "container-1",
                device_type: "blade-chassis",
                position: 10,
                face: "front" as const,
              },
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "container-1",
                slot_id: "invalid-slot-id",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("invalid slot");
      }
    });
  });

  describe("container_id references device without slots", () => {
    it("rejects placing device in non-container", () => {
      // Regular device type (no slots = not a container)
      const normalType = createTestDeviceType({ slug: "regular-server" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [normalType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "not-a-container",
                device_type: "regular-server",
                position: 10,
                face: "front" as const,
              },
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "not-a-container",
                slot_id: "slot-1",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("has no slots");
      }
    });
  });

  describe("single-level nesting enforcement", () => {
    it("rejects nested containers (container placed in container)", () => {
      // Both types are containers (have slots)
      const outerContainer = createTestContainerType({ slug: "outer-chassis" });
      const innerContainer = createTestContainerType({ slug: "inner-chassis" });

      const layout = {
        ...createValidLayout(),
        device_types: [outerContainer, innerContainer],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "outer-1",
                device_type: "outer-chassis",
                position: 10,
                face: "front" as const,
              },
              {
                id: "inner-1",
                device_type: "inner-chassis",
                position: 0,
                face: "front" as const,
                container_id: "outer-1",
                slot_id: "slot-left",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Single-level nesting only",
        );
      }
    });
  });
});

// ============================================================================
// Position Migration Tests (v0.7.0 - 1/6U Internal Units)
// ============================================================================

describe("LayoutSchema position migration", () => {
  // Helper to create migration test layouts using shared factories
  const createMigrationTestLayout = (version: string, devices: unknown[]) => ({
    version,
    name: "Test Layout",
    racks: [
      createTestRack({
        id: "rack-1",
        devices: devices as Parameters<typeof createTestRack>[0]["devices"],
      }),
    ],
    device_types: [],
    settings: createTestLayoutSettings({ show_labels_on_images: true }),
  });

  describe("version-based detection", () => {
    it("migrates positions for version < 0.7.0", () => {
      const layout = createMigrationTestLayout("0.6.16", [
        { id: "device-1", device_type: "server", position: 10, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Position 10 * 6 = 60
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
      }
    });

    it("does not migrate positions for version >= 0.7.0", () => {
      const layout = createMigrationTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 60, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
      }
    });

    it("migrates positions when version is missing", () => {
      const layout = {
        name: "Test Layout",
        racks: [
          createTestRack({
            id: "rack-1",
            devices: [
              {
                id: "device-1",
                device_type: "server",
                position: 5,
                face: "front" as const,
              },
            ],
          }),
        ],
        device_types: [],
        settings: createTestLayoutSettings({ show_labels_on_images: true }),
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Position 5 * 6 = 30
        expect(result.data.racks[0]!.devices[0]!.position).toBe(30);
      }
    });
  });

  describe("heuristic fallback", () => {
    it("migrates when position < 6 even if version >= 0.7.0", () => {
      // Edge case: version says new, but data says old
      const layout = createMigrationTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 5, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Heuristic triggered: 5 * 6 = 30
        expect(result.data.racks[0]!.devices[0]!.position).toBe(30);
      }
    });

    it("does not migrate container children based on heuristic", () => {
      // Container children can have position 0, 1, etc. - don't trigger heuristic
      const layout = createMigrationTestLayout("0.7.0", [
        {
          id: "container-1",
          device_type: "chassis",
          position: 60,
          face: "front",
        },
        {
          id: "child-1",
          device_type: "blade",
          position: 0,
          face: "front",
          container_id: "container-1",
          slot_id: "slot-1",
        },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Container position unchanged (already new format)
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
        // Child position unchanged
        expect(result.data.racks[0]!.devices[1]!.position).toBe(0);
      }
    });
  });

  describe("version stamping after migration", () => {
    it("stamps migrated layouts with current app version", () => {
      const layout = createMigrationTestLayout("0.6.16", [
        { id: "device-1", device_type: "server", position: 10, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Version should be updated to current app version
        expect(result.data.version).toBe(VERSION);
      }
    });

    it("preserves version for layouts that don't need migration", () => {
      const layout = createMigrationTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 60, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Version should remain unchanged
        expect(result.data.version).toBe("0.7.0");
      }
    });
  });
});
