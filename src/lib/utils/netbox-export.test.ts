/**
 * Tests for the NetBox devicetype-library YAML export
 */

import { describe, it, expect } from "vitest";
import { exportToNetBoxYaml } from "./netbox-export";
import { importFromNetBoxYaml, type ImportResult } from "./netbox-import";
import { parseYaml } from "./yaml";
import { getStarterLibrary } from "$lib/data/starterLibrary";
import type { DeviceType } from "$lib/types";
import {
  createTestContainerType,
  createTestDeviceType,
  createTestInterfaceTemplate,
  createTestSlot,
} from "../../tests/factories";

async function exportParsed(deviceType: DeviceType) {
  const result = await exportToNetBoxYaml(deviceType);
  const data = await parseYaml<Record<string, unknown>>(result.yaml);
  return { ...result, data };
}

function fullDeviceType(): DeviceType {
  return {
    ...createTestDeviceType({
      slug: "acme-chassis-2000",
      manufacturer: "Acme",
      model: "Chassis 2000",
      u_height: 2,
      is_full_depth: false,
      airflow: "front-to-rear",
      slot_width: 2,
      rack_widths: [19],
    }),
    part_number: "CH-2000",
    weight: 12.5,
    weight_unit: "kg",
    is_powered: true,
    subdevice_role: "parent",
    notes: "Lab chassis",
    va_rating: 1500,
    tags: ["lab"],
    interfaces: [
      {
        name: "eth0",
        type: "1000base-t",
        mgmt_only: true,
        position: "rear",
        direction: "bidirectional",
      },
    ],
    power_ports: [{ name: "PSU1", type: "iec-60320-c14", maximum_draw: 750 }],
    power_outlets: [
      {
        name: "Outlet 1",
        type: "iec-60320-c13",
        power_port: "PSU1",
        feed_leg: "A",
      },
    ],
    device_bays: [{ name: "Bay 1", position: "1" }],
    inventory_items: [
      { name: "Fan Tray", manufacturer: "Acme", part_id: "FT-1", serial: "X" },
    ],
  };
}

describe("exportToNetBoxYaml", () => {
  it("writes a devicetype-library document in library key order", async () => {
    const { yaml, data } = await exportParsed(fullDeviceType());

    expect(yaml.startsWith("---\n")).toBe(true);
    expect(Object.keys(data)).toEqual([
      "manufacturer",
      "model",
      "slug",
      "part_number",
      "u_height",
      "is_full_depth",
      "airflow",
      "weight",
      "weight_unit",
      "is_powered",
      "subdevice_role",
      "comments",
      "interfaces",
      "power-ports",
      "power-outlets",
      "device-bays",
      "inventory-items",
    ]);
    expect(data.comments).toBe("Lab chassis");
  });

  it("keeps only the fields devicetype-library defines on each component", async () => {
    const { data } = await exportParsed(fullDeviceType());

    expect(data.interfaces).toEqual([
      { name: "eth0", type: "1000base-t", mgmt_only: true },
    ]);
    expect(data["device-bays"]).toEqual([{ name: "Bay 1" }]);
    expect(data["inventory-items"]).toEqual([
      { name: "Fan Tray", manufacturer: "Acme", part_id: "FT-1" },
    ]);
  });

  it("omits empty component lists and unset optional fields", async () => {
    const deviceType = {
      ...createTestDeviceType({ manufacturer: "Acme", model: "Box" }),
      interfaces: [],
      power_ports: [],
    };

    const { data, warnings } = await exportParsed(deviceType);

    expect(Object.keys(data)).toEqual([
      "manufacturer",
      "model",
      "slug",
      "u_height",
      "is_full_depth",
    ]);
    expect(warnings).toEqual([]);
  });

  it("writes is_full_depth as true when the device type leaves it unset", async () => {
    const { data } = await exportParsed(
      createTestDeviceType({ manufacturer: "Acme", model: "Box" }),
    );

    expect(data.is_full_depth).toBe(true);
  });

  it("falls back to Generic and a model from the slug, with warnings", async () => {
    const { data, warnings } = await exportParsed(
      createTestDeviceType({ slug: "mystery-box", model: null }),
    );

    expect(data.manufacturer).toBe("Generic");
    expect(data.model).toBe("mystery-box");
    expect(warnings).toContain(
      'Manufacturer is not set, exported as "Generic"',
    );
    expect(warnings).toContain('Model is not set, exported as "mystery-box"');
  });

  it("uses the legacy name as the model before the slug", async () => {
    const deviceType = {
      ...createTestDeviceType({ slug: "old-box", model: null }),
      manufacturer: "Acme",
      name: "Old Box",
    };

    const { data } = await exportParsed(deviceType);

    expect(data.model).toBe("Old Box");
  });

  describe("carriers and containers", () => {
    it("exports a container as a parent with one device bay per slot", async () => {
      const container = createTestContainerType({
        manufacturer: "Acme",
        slots: [
          createTestSlot({ id: "col-1", name: "Column 1" }),
          createTestSlot({ id: "col-2", position: { row: 0, col: 1 } }),
        ],
      });

      const { data, warnings } = await exportParsed(container);

      expect(data.subdevice_role).toBe("parent");
      expect(data["device-bays"]).toEqual([
        { name: "Column 1" },
        { name: "col-2" },
      ]);
      expect(data).not.toHaveProperty("slots");
      expect(warnings).toContainEqual(
        expect.stringContaining("slot positions and sizes are not carried"),
      );
    });

    it("keeps bay names unique when slot names repeat", async () => {
      const container = createTestContainerType({
        manufacturer: "Acme",
        slots: [
          createTestSlot({ id: "a", name: "Bay" }),
          createTestSlot({ id: "b", name: "Bay" }),
        ],
      });

      const { data } = await exportParsed(container);
      const names = (data["device-bays"] as { name: string }[]).map(
        (b) => b.name,
      );

      expect(new Set(names).size).toBe(names.length);
      expect(names).toContain("Bay");
    });

    it("exports a child type as 0U and warns that the height is not carried", async () => {
      const child: DeviceType = {
        ...createTestDeviceType({ manufacturer: "Acme", model: "Blade" }),
        u_height: 2,
        subdevice_role: "child",
      };

      const { data, warnings } = await exportParsed(child);

      expect(data.u_height).toBe(0);
      expect(data.subdevice_role).toBe("child");
      expect(warnings).toContainEqual(expect.stringContaining("2U height"));
    });

    it("does not export sub-U rail gear as a child", async () => {
      const halfU = createTestDeviceType({
        manufacturer: "MikroTik",
        model: "Half U",
        u_height: 0.5,
        slot_width: 1,
      });

      const { data } = await exportParsed(halfU);

      expect(data.u_height).toBe(0.5);
      expect(data).not.toHaveProperty("subdevice_role");
    });
  });

  describe("interface types", () => {
    it("exports a Rackula-only AV connector as other and names it in a warning", async () => {
      const mixer: DeviceType = {
        ...createTestDeviceType({ manufacturer: "Acme", model: "Mixer" }),
        interfaces: [
          createTestInterfaceTemplate({ name: "Mic 1", type: "xlr-3" }),
          createTestInterfaceTemplate({ name: "Mic 2", type: "xlr-3" }),
          createTestInterfaceTemplate({ name: "LAN", type: "1000base-t" }),
        ],
      };

      const { data, warnings } = await exportParsed(mixer);

      expect(data.interfaces).toEqual([
        { name: "Mic 1", type: "other" },
        { name: "Mic 2", type: "other" },
        { name: "LAN", type: "1000base-t" },
      ]);
      expect(warnings).toContainEqual(expect.stringContaining('"xlr-3"'));
    });

    it("passes an unknown kept type through unchanged with a warning", async () => {
      const deviceType: DeviceType = {
        ...createTestDeviceType({ manufacturer: "Acme", model: "Switch" }),
        interfaces: [
          createTestInterfaceTemplate({ name: "1", type: "400gbase-x-osfp" }),
        ],
      };

      const { data, warnings } = await exportParsed(deviceType);

      expect(data.interfaces).toEqual([{ name: "1", type: "400gbase-x-osfp" }]);
      expect(warnings).toContainEqual(
        expect.stringContaining('"400gbase-x-osfp"'),
      );
    });

    it("drops a PoE type NetBox does not define, with a warning", async () => {
      const deviceType: DeviceType = {
        ...createTestDeviceType({ manufacturer: "Acme", model: "AP" }),
        interfaces: [
          {
            name: "eth0",
            type: "1000base-t",
            poe_mode: "pd",
            poe_type: "passive-24v-1pair",
          },
        ],
      };

      const { data, warnings } = await exportParsed(deviceType);

      expect(data.interfaces).toEqual([
        { name: "eth0", type: "1000base-t", poe_mode: "pd" },
      ]);
      expect(warnings).toContainEqual(
        expect.stringContaining('"passive-24v-1pair"'),
      );
    });
  });

  describe("warnings in the file", () => {
    it("lists the warnings in a comment block after the document start", async () => {
      const { yaml, warnings } = await exportToNetBoxYaml(
        createTestDeviceType({ model: "Box" }),
      );

      const lines = yaml.split("\n");
      expect(lines[0]).toBe("---");
      expect(lines[1]?.startsWith("#")).toBe(true);
      for (const warning of warnings) {
        expect(yaml).toContain(`# - ${warning}`);
      }
    });

    it("writes no comment block when nothing changed", async () => {
      const { yaml } = await exportToNetBoxYaml(
        createTestDeviceType({ manufacturer: "Acme", model: "Box" }),
      );

      expect(yaml).not.toContain("#");
    });

    it("keeps a line break in a warning from injecting YAML keys", async () => {
      const deviceType: DeviceType = {
        ...createTestDeviceType({ manufacturer: "Acme", model: "Real Model" }),
        interfaces: [
          createTestInterfaceTemplate({
            name: "1",
            type: "evil\nmodel: Injected\r\nslug: injected",
          }),
        ],
      };

      const { data } = await exportParsed(deviceType);

      expect(data.model).toBe("Real Model");
      expect(data.slug).toBe(deviceType.slug);
    });
  });
});

describe("export then import round trip", () => {
  async function roundTrip(deviceType: DeviceType): Promise<ImportResult> {
    const { yaml } = await exportToNetBoxYaml(deviceType);
    const imported = await importFromNetBoxYaml(yaml);
    if (!imported.success) {
      throw new Error(`re-import failed: ${imported.error}`);
    }
    return imported.result;
  }

  it("preserves the NetBox fields of a device type", async () => {
    const original = fullDeviceType();

    const { deviceType, warnings } = await roundTrip(original);

    expect(deviceType).toMatchObject({
      manufacturer: original.manufacturer,
      model: original.model,
      slug: original.slug,
      part_number: original.part_number,
      u_height: original.u_height,
      is_full_depth: original.is_full_depth,
      airflow: original.airflow,
      weight: original.weight,
      weight_unit: original.weight_unit,
      subdevice_role: original.subdevice_role,
      notes: original.notes,
      power_ports: original.power_ports,
      power_outlets: original.power_outlets,
    });
    expect(deviceType.interfaces).toEqual([
      { name: "eth0", type: "1000base-t", mgmt_only: true },
    ]);
    expect(deviceType.device_bays).toEqual([{ name: "Bay 1" }]);
    expect(deviceType.inventory_items).toEqual([
      { name: "Fan Tray", manufacturer: "Acme", part_id: "FT-1" },
    ]);
    expect(warnings).not.toContainEqual(expect.stringContaining("Skipped"));
  });

  it("round-trips every starter container to the same slots and bay names", async () => {
    const containers = getStarterLibrary().filter(
      (t) => (t.slots?.length ?? 0) > 0,
    );
    expect(containers.length).toBeGreaterThan(0);

    for (const container of containers) {
      const { deviceType } = await roundTrip(container);

      expect(deviceType.subdevice_role).toBe("parent");
      expect(deviceType.slots).toEqual(container.slots);
    }
  });

  it("round-trips a custom container to the same slot count and bay names", async () => {
    const container = createTestContainerType({
      slug: "acme-shelf-3",
      manufacturer: "Acme",
      slots: [
        createTestSlot({ id: "a", name: "Left" }),
        createTestSlot({
          id: "b",
          name: "Middle",
          position: { row: 0, col: 1 },
        }),
        createTestSlot({
          id: "c",
          name: "Right",
          position: { row: 0, col: 2 },
        }),
      ],
    });

    const { deviceType } = await roundTrip(container);

    expect(deviceType.slots?.map((s) => s.name)).toEqual([
      "Left",
      "Middle",
      "Right",
    ]);
  });

  it("brings a child type back as 1U with a warning", async () => {
    const child: DeviceType = {
      ...createTestDeviceType({ manufacturer: "Acme", model: "Blade" }),
      u_height: 2,
      subdevice_role: "child",
    };

    const { deviceType, warnings } = await roundTrip(child);

    expect(deviceType.subdevice_role).toBe("child");
    expect(deviceType.u_height).toBe(1);
    expect(warnings).toContainEqual(expect.stringContaining("match the bay"));
  });

  it("brings a Rackula-only interface type back as other", async () => {
    const mixer: DeviceType = {
      ...createTestDeviceType({ manufacturer: "Acme", model: "Mixer" }),
      interfaces: [
        createTestInterfaceTemplate({ name: "Mic 1", type: "xlr-3" }),
      ],
    };

    const { deviceType } = await roundTrip(mixer);

    expect(deviceType.interfaces).toEqual([{ name: "Mic 1", type: "other" }]);
  });
});
