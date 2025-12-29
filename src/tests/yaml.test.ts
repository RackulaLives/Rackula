/**
 * YAML Utilities Tests
 * Verifies js-yaml dependency and basic operations
 */

import { describe, it, expect } from "vitest";
import {
  serializeToYaml,
  parseYaml,
  serializeLayoutToYaml,
  parseLayoutYaml,
} from "$lib/utils/yaml";
import type { Layout } from "$lib/types";

describe("YAML Utilities", () => {
  describe("js-yaml dependency", () => {
    it("can be imported", () => {
      expect(serializeToYaml).toBeDefined();
      expect(parseYaml).toBeDefined();
    });
  });

  describe("serializeToYaml", () => {
    it("serializes simple object", () => {
      const data = { name: "Test", value: 42 };
      const result = serializeToYaml(data);
      expect(result).toContain("name: Test");
      expect(result).toContain("value: 42");
    });

    it("serializes nested object", () => {
      const data = {
        rack: {
          name: "Homelab",
          height: 42,
        },
      };
      const result = serializeToYaml(data);
      expect(result).toContain("rack:");
      expect(result).toContain("name: Homelab");
      expect(result).toContain("height: 42");
    });

    it("serializes arrays", () => {
      const data = {
        items: ["one", "two", "three"],
      };
      const result = serializeToYaml(data);
      expect(result).toContain("items:");
      expect(result).toContain("- one");
      expect(result).toContain("- two");
      expect(result).toContain("- three");
    });
  });

  describe("parseYaml", () => {
    it("parses simple YAML", () => {
      const yaml = "name: Test\nvalue: 42";
      const result = parseYaml<{ name: string; value: number }>(yaml);
      expect(result.name).toBe("Test");
      expect(result.value).toBe(42);
    });

    it("parses nested YAML", () => {
      const yaml = `
rack:
  name: Homelab
  height: 42
`;
      const result = parseYaml<{ rack: { name: string; height: number } }>(
        yaml,
      );
      expect(result.rack.name).toBe("Homelab");
      expect(result.rack.height).toBe(42);
    });

    it("parses arrays", () => {
      const yaml = `
items:
  - one
  - two
  - three
`;
      const result = parseYaml<{ items: string[] }>(yaml);
      expect(result.items).toEqual(["one", "two", "three"]);
    });
  });

  describe("round-trip", () => {
    it("preserves data through serialize then parse", () => {
      const original = {
        version: "0.2.0",
        name: "Test Layout",
        rack: {
          name: "Homelab Rack",
          height: 42,
          width: 19,
        },
        device_types: [
          {
            slug: "test-device",
            u_height: 2,
          },
        ],
      };

      const yaml = serializeToYaml(original);
      const parsed = parseYaml(yaml);

      expect(parsed).toEqual(original);
    });
  });
});

describe("v0.2 Layout YAML Serialization", () => {
  const createValidLayout = (): Layout => ({
    version: "0.2.0",
    name: "My Homelab",
    rack: {
      name: "Main Rack",
      height: 42,
      width: 19,
      desc_units: false,
      show_rear: true,
      form_factor: "4-post-cabinet",
      starting_unit: 1,
      position: 0,
      devices: [],
    },
    device_types: [],
    settings: {
      display_mode: "label",
      show_labels_on_images: true,
    },
  });

  describe("serializeLayoutToYaml", () => {
    it("produces valid YAML that can be parsed back", () => {
      const layout = createValidLayout();
      const yaml = serializeLayoutToYaml(layout);
      const parsed = parseYaml(yaml);

      expect(parsed).toBeDefined();
    });

    it("excludes view field from output", () => {
      const layout = createValidLayout();
      layout.rack.view = "rear"; // Runtime-only field

      const yaml = serializeLayoutToYaml(layout);

      expect(yaml).not.toContain("view:");
      expect(yaml).not.toContain("view: rear");
    });

    it("includes all required fields", () => {
      const layout = createValidLayout();
      const yaml = serializeLayoutToYaml(layout);

      expect(yaml).toContain("version:");
      expect(yaml).toContain("name:");
      expect(yaml).toContain("rack:");
      expect(yaml).toContain("device_types:");
      expect(yaml).toContain("settings:");
    });

    it("maintains field order (version, name, rack, device_types, settings)", () => {
      const layout = createValidLayout();
      const yaml = serializeLayoutToYaml(layout);

      const versionIndex = yaml.indexOf("version:");
      const nameIndex = yaml.indexOf("name:");
      const rackIndex = yaml.indexOf("rack:");
      const deviceTypesIndex = yaml.indexOf("device_types:");
      const settingsIndex = yaml.indexOf("settings:");

      expect(versionIndex).toBeLessThan(nameIndex);
      expect(nameIndex).toBeLessThan(rackIndex);
      expect(rackIndex).toBeLessThan(deviceTypesIndex);
      expect(deviceTypesIndex).toBeLessThan(settingsIndex);
    });

    it("properly indents nested structures", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure with colour and category at top level
      layout.device_types = [
        {
          slug: "test-server",
          u_height: 2,
          colour: "#3b82f6",
          category: "server",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);

      // Check that colour and category are flat (not nested under Rackula)
      expect(yaml).not.toContain("Rackula:");
      expect(yaml).toContain("colour:");
      expect(yaml).toContain("category:");
    });

    it("serializes device types correctly", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure
      layout.device_types = [
        {
          slug: "synology-ds920-plus",
          u_height: 2,
          manufacturer: "Synology",
          model: "DS920+",
          colour: "#10b981",
          category: "storage",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);

      expect(yaml).toContain("slug: synology-ds920-plus");
      expect(yaml).toContain("u_height: 2");
      expect(yaml).toContain("manufacturer: Synology");
    });

    it("serializes placed devices correctly", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure
      layout.device_types = [
        {
          slug: "test-device",
          u_height: 1,
          colour: "#000000",
          category: "other",
        },
      ];
      // Schema v1.0.0: PlacedDevice requires id
      layout.rack.devices = [
        {
          id: "device-1",
          device_type: "test-device",
          position: 10,
          face: "front",
        },
        {
          id: "device-2",
          device_type: "test-device",
          name: "Named Instance",
          position: 20,
          face: "rear",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);

      expect(yaml).toContain("device_type: test-device");
      expect(yaml).toContain("position: 10");
      expect(yaml).toContain("position: 20");
      expect(yaml).toContain("name: Named Instance");
    });
  });

  describe("parseLayoutYaml", () => {
    it("parses valid YAML correctly", () => {
      const layout = createValidLayout();
      const yaml = serializeLayoutToYaml(layout);

      const parsed = parseLayoutYaml(yaml);

      expect(parsed.version).toBe("0.2.0");
      expect(parsed.name).toBe("My Homelab");
      expect(parsed.rack.name).toBe("Main Rack");
    });

    it("returns layout with all fields", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure
      layout.device_types = [
        {
          slug: "test-server",
          u_height: 2,
          colour: "#000000",
          category: "server",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);
      const parsed = parseLayoutYaml(yaml);

      expect(parsed.device_types).toHaveLength(1);
      expect(parsed.device_types[0]!.slug).toBe("test-server");
      expect(parsed.settings.display_mode).toBe("label");
    });

    it("adds default view: front", () => {
      const layout = createValidLayout();
      const yaml = serializeLayoutToYaml(layout);

      const parsed = parseLayoutYaml(yaml);

      expect(parsed.rack.view).toBe("front");
    });

    it("throws on invalid YAML syntax", () => {
      const invalidYaml = `
version: "0.2.0
name: Broken
`;
      expect(() => parseLayoutYaml(invalidYaml)).toThrow();
    });

    it("throws on schema validation failure", () => {
      const invalidLayout = `
version: "0.2.0"
name: ""
rack:
  name: Test
  height: 0
  width: 15
  desc_units: false
  form_factor: invalid
  starting_unit: 1
  position: 0
  devices: []
device_types: []
settings:
  display_mode: label
  show_labels_on_images: true
`;
      expect(() => parseLayoutYaml(invalidLayout)).toThrow();
    });

    it("error message includes details about what is wrong", () => {
      const invalidLayout = `
version: "0.2.0"
name: "Test"
rack:
  name: "Test Rack"
  height: 42
  width: 15
  desc_units: false
  form_factor: "4-post-cabinet"
  starting_unit: 1
  position: 0
  devices: []
device_types: []
settings:
  display_mode: "label"
  show_labels_on_images: true
`;
      try {
        parseLayoutYaml(invalidLayout);
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as Error).message).toContain("width");
      }
    });
  });

  describe("layout round-trip", () => {
    it("serialize then parse returns equivalent object", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure
      layout.device_types = [
        {
          slug: "synology-ds920-plus",
          u_height: 2,
          manufacturer: "Synology",
          model: "DS920+",
          colour: "#10b981",
          category: "storage",
        },
      ];
      // Schema v1.0.0: PlacedDevice requires id
      layout.rack.devices = [
        {
          id: "device-1",
          device_type: "synology-ds920-plus",
          position: 10,
          face: "front",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);
      const parsed = parseLayoutYaml(yaml);

      // Compare without runtime fields
      const { view: _, ...parsedRack } = parsed.rack;
      expect(parsedRack).toEqual(layout.rack);
      expect(parsed.device_types).toEqual(layout.device_types);
      expect(parsed.settings).toEqual(layout.settings);
    });

    it("all device_types preserved", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure
      layout.device_types = [
        {
          slug: "device-1",
          u_height: 1,
          colour: "#111111",
          category: "server",
        },
        {
          slug: "device-2",
          u_height: 2,
          colour: "#222222",
          category: "storage",
        },
        {
          slug: "device-3",
          u_height: 3,
          colour: "#333333",
          category: "network",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);
      const parsed = parseLayoutYaml(yaml);

      expect(parsed.device_types).toHaveLength(3);
      expect(parsed.device_types.map((dt) => dt.slug)).toEqual([
        "device-1",
        "device-2",
        "device-3",
      ]);
    });

    it("all devices preserved", () => {
      const layout = createValidLayout();
      // Schema v1.0.0: Flat structure
      layout.device_types = [
        {
          slug: "test-device",
          u_height: 1,
          colour: "#000000",
          category: "other",
        },
      ];
      // Schema v1.0.0: PlacedDevice requires id
      layout.rack.devices = [
        {
          id: "device-1",
          device_type: "test-device",
          position: 1,
          face: "front",
        },
        {
          id: "device-2",
          device_type: "test-device",
          name: "Second",
          position: 5,
          face: "rear",
        },
        {
          id: "device-3",
          device_type: "test-device",
          position: 10,
          face: "both",
        },
      ];

      const yaml = serializeLayoutToYaml(layout);
      const parsed = parseLayoutYaml(yaml);

      expect(parsed.rack.devices).toHaveLength(3);
      expect(parsed.rack.devices[0]!.position).toBe(1);
      expect(parsed.rack.devices[1]!.name).toBe("Second");
      expect(parsed.rack.devices[2]!.face).toBe("both");
    });

    it("settings preserved", () => {
      const layout = createValidLayout();
      layout.settings = {
        display_mode: "image",
        show_labels_on_images: false,
      };

      const yaml = serializeLayoutToYaml(layout);
      const parsed = parseLayoutYaml(yaml);

      expect(parsed.settings.display_mode).toBe("image");
      expect(parsed.settings.show_labels_on_images).toBe(false);
    });
  });
});
