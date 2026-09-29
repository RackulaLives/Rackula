/**
 * Tests for NetBox device import utilities
 */

import { describe, it, expect } from "vitest";
import {
  parseNetBoxYaml,
  inferCategory,
  convertToDeviceType,
  importFromNetBoxYaml,
  type NetBoxDeviceType,
  type ImportResult,
} from "./netbox-import";
import { parseLayoutObject } from "./yaml";
import {
  createTestLayout,
  createTestNetBoxDeviceType,
} from "../../tests/factories";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import { DeviceTypeSchema } from "$lib/schemas";
import { findStarterDevice } from "$lib/data/starterLibrary";

describe("netbox-import", () => {
  describe("parseNetBoxYaml", () => {
    it("parses valid NetBox YAML", async () => {
      const yaml = `
manufacturer: Ubiquiti
model: USW-Pro-24
slug: ubiquiti-usw-pro-24
u_height: 1
is_full_depth: false
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.manufacturer).toBe("Ubiquiti");
        expect(result.data.model).toBe("USW-Pro-24");
        expect(result.data.slug).toBe("ubiquiti-usw-pro-24");
        expect(result.data.u_height).toBe(1);
        expect(result.data.is_full_depth).toBe(false);
      }
    });

    it("parses YAML with interfaces", async () => {
      const yaml = `
manufacturer: Cisco
model: Catalyst 9300-48P
slug: cisco-catalyst-9300-48p
u_height: 1
interfaces:
  - name: GigabitEthernet1/0/1
    type: 1000base-t
  - name: GigabitEthernet1/0/2
    type: 1000base-t
    poe_mode: pse
    poe_type: type2-ieee802.3at
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(true);
      if (result.success) {
        // eslint-disable-next-line no-restricted-syntax -- Testing schema validation (exactly 2 interfaces)
        expect(result.data.interfaces).toHaveLength(2);
        expect(result.data.interfaces![0].name).toBe("GigabitEthernet1/0/1");
        expect(result.data.interfaces![0].type).toBe("1000base-t");
        expect(result.data.interfaces![1].poe_mode).toBe("pse");
      }
    });

    it("parses YAML with power ports and outlets", async () => {
      const yaml = `
manufacturer: APC
model: AP7901
slug: apc-ap7901
u_height: 1
power_ports:
  - name: Power Input
    type: iec-60320-c14
    maximum_draw: 1920
power_outlets:
  - name: Outlet 1
    type: iec-60320-c13
    power_port: Power Input
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(true);
      if (result.success) {
        // eslint-disable-next-line no-restricted-syntax -- Testing schema validation (exactly 1 power port)
        expect(result.data.power_ports).toHaveLength(1);
        // eslint-disable-next-line no-restricted-syntax -- Testing schema validation (exactly 1 power outlet)
        expect(result.data.power_outlets).toHaveLength(1);
        expect(result.data.power_ports![0].maximum_draw).toBe(1920);
      }
    });

    it("returns error for missing manufacturer", async () => {
      const yaml = `
model: Some Device
slug: some-device
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("manufacturer");
      }
    });

    it("returns error for missing model", async () => {
      const yaml = `
manufacturer: Some Vendor
slug: some-device
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("model");
      }
    });

    it("returns error for missing slug", async () => {
      const yaml = `
manufacturer: Some Vendor
model: Some Device
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("slug");
      }
    });

    it("returns error for invalid YAML syntax", async () => {
      const yaml = `
{invalid yaml
  - not: [properly: closed
`;
      const result = await parseNetBoxYaml(yaml);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("YAML parse error");
      }
    });
  });

  describe("inferCategory", () => {
    it("infers network category for switches", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Ubiquiti",
        model: "USW-Pro-24",
        slug: "ubiquiti-usw-pro-24",
      };
      expect(inferCategory(device)).toBe("network");
    });

    it("infers network category for routers", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "ISR4321 Router",
        slug: "cisco-isr4321",
      };
      expect(inferCategory(device)).toBe("network");
    });

    it("infers firewall category for firewalls", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Fortinet",
        model: "FortiGate 60F",
        slug: "fortinet-fortigate-60f",
      };
      expect(inferCategory(device)).toBe("firewall");
    });

    it("infers firewall for Cisco ASA models with separators", () => {
      // ASA model strings appear with and without separators
      // (e.g. "ASA5506-X", "ASA 5506-X", "asa-5506-x").
      for (const model of ["ASA5506-X", "ASA 5506-X", "ASA-5506-X"]) {
        const device: NetBoxDeviceType = {
          manufacturer: "Cisco",
          model,
          slug: `cisco-${model.toLowerCase().replace(/\s/g, "-")}`,
        };
        expect(inferCategory(device)).toBe("firewall");
      }
    });

    it("prefers firewall over network for Netgate security gateways", () => {
      // "Security Gateway" also contains the network hint "gateway";
      // the firewall branch must run first so it resolves to firewall.
      const device: NetBoxDeviceType = {
        manufacturer: "Netgate",
        model: "6100 Security Gateway",
        slug: "netgate-6100",
      };
      expect(inferCategory(device)).toBe("firewall");
    });

    it("infers network category for devices with interfaces", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Network Device",
        slug: "generic-network-device",
        interfaces: [{ name: "eth0", type: "1000base-t" }],
      };
      expect(inferCategory(device)).toBe("network");
    });

    it("infers storage category for NAS devices", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Synology",
        model: "RS1221+",
        slug: "synology-rs1221-plus",
      };
      expect(inferCategory(device)).toBe("storage");
    });

    it("infers storage category for QNAP", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "QNAP",
        model: "TS-873A",
        slug: "qnap-ts-873a",
      };
      expect(inferCategory(device)).toBe("storage");
    });

    it("infers power category for UPS", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "APC",
        model: "Smart-UPS 1500",
        slug: "apc-smart-ups-1500",
      };
      expect(inferCategory(device)).toBe("power");
    });

    it("infers power category for PDU", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "CyberPower",
        model: "PDU41001",
        slug: "cyberpower-pdu41001",
      };
      expect(inferCategory(device)).toBe("power");
    });

    it("infers server category for Dell PowerEdge", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
      };
      expect(inferCategory(device)).toBe("server");
    });

    it("infers server category for HPE ProLiant", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "HPE",
        model: "ProLiant DL360 Gen10",
        slug: "hpe-proliant-dl360-gen10",
      };
      expect(inferCategory(device)).toBe("server");
    });

    it("infers kvm category for KVM switches", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Raritan",
        model: "KX III-108",
        slug: "raritan-kx-iii-108",
      };
      expect(inferCategory(device)).toBe("kvm");
    });

    it("infers kvm category for devices with console_server_ports", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Opengear",
        model: "IM7208",
        slug: "opengear-im7208",
        console_server_ports: [{ name: "Serial 1" }],
      };
      expect(inferCategory(device)).toBe("kvm");
    });

    it("infers av-media category for video equipment", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Blackmagic Design",
        model: "ATEM Television Studio",
        slug: "blackmagic-atem-television-studio",
      };
      expect(inferCategory(device)).toBe("av-media");
    });

    it("infers patch-panel category", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "24-Port Patch Panel",
        slug: "generic-24-port-patch-panel",
      };
      expect(inferCategory(device)).toBe("patch-panel");
    });

    it("returns other for unknown devices", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Unknown",
        model: "Mystery Box",
        slug: "unknown-mystery-box",
      };
      expect(inferCategory(device)).toBe("other");
    });
  });

  describe("convertToDeviceType", () => {
    // Unwrap a successful conversion. Fails the test if the conversion was
    // refused, so the existing happy-path assertions can read .deviceType etc.
    function convertOk(
      ...args: Parameters<typeof convertToDeviceType>
    ): ImportResult {
      const converted = convertToDeviceType(...args);
      if (!converted.success) {
        throw new Error(`expected success, got error: ${converted.error}`);
      }
      return converted.result;
    }

    it("converts basic NetBox device to Rackula DeviceType", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Ubiquiti",
        model: "USW-Pro-24",
        slug: "ubiquiti-usw-pro-24",
        u_height: 1,
        is_full_depth: false,
      };

      const result = convertOk(netbox);

      expect(result.deviceType.slug).toBe("ubiquiti-usw-pro-24");
      expect(result.deviceType.manufacturer).toBe("Ubiquiti");
      expect(result.deviceType.model).toBe("USW-Pro-24");
      expect(result.deviceType.u_height).toBe(1);
      expect(result.deviceType.is_full_depth).toBe(false);
      expect(result.deviceType.category).toBe("network");
      expect(result.deviceType.colour).toBe(CATEGORY_COLOURS.network);
      expect(result.inferredCategory).toBe("network");
    });

    it("applies custom category override", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Unknown Device",
        slug: "generic-unknown-device",
      };

      const result = convertOk(netbox, { category: "server" });

      expect(result.deviceType.category).toBe("server");
      expect(result.deviceType.colour).toBe(CATEGORY_COLOURS.server);
    });

    it("applies custom colour override", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Ubiquiti",
        model: "USW-Pro-24",
        slug: "ubiquiti-usw-pro-24",
      };

      const result = convertOk(netbox, { colour: "#FF0000" });

      expect(result.deviceType.colour).toBeTruthy(); // Color is set
    });

    it("maps airflow correctly", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        airflow: "front-to-rear",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.airflow).toBe("front-to-rear");
    });

    it("warns on unknown airflow value", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        airflow: "unknown-airflow-type",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.airflow).toBeUndefined();
      expect(result.warnings).toContain(
        "Unknown airflow value: unknown-airflow-type",
      );
    });

    it("converts interfaces", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "Catalyst 9300",
        slug: "cisco-catalyst-9300",
        interfaces: [
          { name: "Gi1/0/1", type: "1000base-t", mgmt_only: false },
          { name: "Mgmt0", type: "1000base-t", mgmt_only: true },
        ],
      };

      const result = convertOk(netbox);

      // eslint-disable-next-line no-restricted-syntax -- Testing conversion (exactly 2 interfaces)
      expect(result.deviceType.interfaces).toHaveLength(2);
      expect(result.deviceType.interfaces![0].name).toBe("Gi1/0/1");
      expect(result.deviceType.interfaces![1].mgmt_only).toBe(true);
    });

    it("keeps an unknown interface type with a warning", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "Catalyst 9300",
        slug: "cisco-catalyst-9300",
        interfaces: [{ name: "Gi1/0/1", type: "1000base-lx" }],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.interfaces![0].type).toBe("1000base-lx");
      expect(result.warnings).toContain(
        "Unknown interface type: 1000base-lx, shown as a generic port",
      );
    });

    it("maps an unusable interface type to other with a warning", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "Catalyst 9300",
        slug: "cisco-catalyst-9300",
        interfaces: [{ name: "Gi1/0/1", type: "" }],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.interfaces![0].type).toBe("other");
      expect(result.warnings).toContain(
        'Unknown interface type: , using "other"',
      );
    });

    it("preserves valid interface type exactly", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "Catalyst 9300",
        slug: "cisco-catalyst-9300",
        interfaces: [{ name: "Te1/0/1", type: "10gbase-t" }],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.interfaces![0].type).toBe("10gbase-t");
      expect(result.warnings).toEqual([]);
    });

    it("drops invalid poe_mode and poe_type with warnings", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "Catalyst 9300",
        slug: "cisco-catalyst-9300",
        interfaces: [
          {
            name: "Gi1/0/1",
            type: "1000base-t",
            poe_mode: "both",
            poe_type: "passive-12v",
          },
        ],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.interfaces![0].poe_mode).toBeUndefined();
      expect(result.deviceType.interfaces![0].poe_type).toBeUndefined();
      expect(result.warnings).toContain("Unknown poe_mode value: both");
      expect(result.warnings).toContain("Unknown poe_type value: passive-12v");
    });

    it("preserves valid poe values and omits absent ones without warnings", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Cisco",
        model: "Catalyst 9300",
        slug: "cisco-catalyst-9300",
        interfaces: [
          {
            name: "Gi1/0/1",
            type: "1000base-t",
            poe_mode: "pse",
            poe_type: "type2-ieee802.3at",
          },
          { name: "Gi1/0/2", type: "1000base-t" },
        ],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.interfaces![0].poe_mode).toBe("pse");
      expect(result.deviceType.interfaces![0].poe_type).toBe(
        "type2-ieee802.3at",
      );
      expect(result.deviceType.interfaces![1].poe_mode).toBeUndefined();
      expect(result.deviceType.interfaces![1].poe_type).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });

    it("produces a valid DeviceType when all interface enums are invalid", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Mystery Switch",
        slug: "generic-mystery-switch",
        interfaces: [
          {
            name: "eth0",
            type: "bogus-type",
            poe_mode: "bogus-mode",
            poe_type: "bogus-poe",
          },
        ],
      };

      const result = convertOk(netbox);

      expect(() => DeviceTypeSchema.parse(result.deviceType)).not.toThrow();
    });

    it("converts power ports and outlets", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "APC",
        model: "AP7901",
        slug: "apc-ap7901",
        power_ports: [{ name: "Input", maximum_draw: 1920 }],
        power_outlets: [{ name: "Outlet 1", power_port: "Input" }],
      };

      const result = convertOk(netbox);

      // eslint-disable-next-line no-restricted-syntax -- Testing conversion (exactly 1 power port)
      expect(result.deviceType.power_ports).toHaveLength(1);
      expect(result.deviceType.power_ports![0].maximum_draw).toBe(1920);
      // eslint-disable-next-line no-restricted-syntax -- Testing conversion (exactly 1 power outlet)
      expect(result.deviceType.power_outlets).toHaveLength(1);
    });

    it("defaults u_height to 1 if not specified", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.u_height).toBe(1);
    });

    it("defaults is_full_depth to true if not specified", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.is_full_depth).toBe(true);
    });

    it("preserves valid feed_leg on power outlets", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "APC",
        model: "AP7901",
        slug: "apc-ap7901",
        power_outlets: [{ name: "Outlet 1", feed_leg: "A" }],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.power_outlets![0].feed_leg).toBe("A");
      expect(result.warnings).toEqual([]);
    });

    it("drops invalid feed_leg with a warning", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "APC",
        model: "AP7901",
        slug: "apc-ap7901",
        power_outlets: [{ name: "Outlet 1", feed_leg: "N" }],
      };

      const result = convertOk(netbox);

      expect(result.deviceType.power_outlets![0].feed_leg).toBeUndefined();
      expect(result.warnings).toContain("Unknown feed_leg value: N");
    });

    it("preserves valid weight_unit", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        weight: 21.9,
        weight_unit: "lb",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.weight).toBe(21.9);
      expect(result.deviceType.weight_unit).toBe("lb");
      expect(result.warnings).toEqual([]);
    });

    it("defaults weight_unit to kg when absent", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        weight: 21.9,
      };

      const result = convertOk(netbox);

      expect(result.deviceType.weight).toBe(21.9);
      expect(result.deviceType.weight_unit).toBe("kg");
      expect(result.warnings).toEqual([]);
    });

    it("drops weight and invalid weight_unit with a warning", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        weight: 500,
        weight_unit: "g",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.weight).toBeUndefined();
      expect(result.deviceType.weight_unit).toBeUndefined();
      expect(result.warnings).toContain("Unknown weight_unit value: g");
    });

    it("preserves valid subdevice_role", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge FX2",
        slug: "dell-poweredge-fx2",
        subdevice_role: "parent",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.subdevice_role).toBe("parent");
      expect(result.warnings).toEqual([]);
    });

    it("drops invalid subdevice_role with a warning", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge FX2",
        slug: "dell-poweredge-fx2",
        subdevice_role: "standalone",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.subdevice_role).toBeUndefined();
      expect(result.warnings).toContain(
        "Unknown subdevice_role value: standalone",
      );
    });

    it("omits absent optional enum fields without warnings", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.weight).toBeUndefined();
      expect(result.deviceType.weight_unit).toBeUndefined();
      expect(result.deviceType.subdevice_role).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });

    it("produces a schema-valid DeviceType when all enum values are invalid", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
        airflow: "sideways",
        weight: 500,
        weight_unit: "g",
        subdevice_role: "standalone",
        power_outlets: [{ name: "Outlet 1", feed_leg: "N" }],
      };

      const result = convertOk(netbox);

      expect(() => DeviceTypeSchema.parse(result.deviceType)).not.toThrow();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("includes comments as notes", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
        comments: "This is a test device",
      };

      const result = convertOk(netbox);

      expect(result.deviceType.notes).toBe("This is a test device");
    });

    it("maps inventory items", () => {
      const netbox = createTestNetBoxDeviceType({
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        inventory_items: [
          { name: "PSU 1", manufacturer: "Dell", part_id: "450-AEBM" },
        ],
      });

      const result = convertOk(netbox);

      expect(result.deviceType.inventory_items).toContainEqual({
        name: "PSU 1",
        manufacturer: "Dell",
        part_id: "450-AEBM",
      });
      expect(result.warnings).toEqual([]);
    });

    it("warns that console ports have no Rackula representation", () => {
      const netbox = createTestNetBoxDeviceType({
        manufacturer: "Opengear",
        model: "IM7208",
        slug: "opengear-im7208",
        console_ports: [{ name: "Console 1" }],
        console_server_ports: [{ name: "Serial 1" }, { name: "Serial 2" }],
      });

      const result = convertOk(netbox);

      expect(result.warnings).toContain(
        "3 console port(s) are not yet supported by Rackula and were not imported",
      );
    });
  });

  describe("devicetype-library component list keys", () => {
    // netbox-community/devicetype-library writes every component list except
    // `interfaces` with hyphens. These fixtures mirror that on-disk form.
    async function importOk(yaml: string): Promise<ImportResult> {
      const imported = await importFromNetBoxYaml(yaml);
      if (!imported.success) {
        throw new Error(`expected success, got error: ${imported.error}`);
      }
      return imported.result;
    }

    it("keeps power ports, power outlets, device bays and inventory items from hyphenated keys", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
u_height: 2
power-ports:
  - name: PSU1
    type: iec-60320-c14
    maximum_draw: 750
power-outlets:
  - name: Outlet 1
    type: iec-60320-c13
    power_port: PSU1
    feed_leg: A
device-bays:
  - name: Bay 1
inventory-items:
  - name: Fan Tray
    manufacturer: Generic
    part_id: FT-1
`);

      expect(result.deviceType.power_ports).toContainEqual({
        name: "PSU1",
        type: "iec-60320-c14",
        maximum_draw: 750,
      });
      expect(result.deviceType.power_outlets).toContainEqual({
        name: "Outlet 1",
        type: "iec-60320-c13",
        power_port: "PSU1",
        feed_leg: "A",
      });
      expect(result.deviceType.device_bays).toContainEqual({ name: "Bay 1" });
      expect(result.deviceType.inventory_items).toContainEqual({
        name: "Fan Tray",
        manufacturer: "Generic",
        part_id: "FT-1",
      });
      expect(result.warnings).toEqual([]);
    });

    it("warns that hyphenated console and console-server ports are not supported", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Serial Box
slug: generic-serial-box
console-ports:
  - name: Console
    type: rj-45
console-server-ports:
  - name: Port 1
    type: rj-45
  - name: Port 2
    type: rj-45
`);

      expect(result.warnings).toContain(
        "3 console port(s) are not yet supported by Rackula and were not imported",
      );
    });

    it("infers kvm from hyphenated console-server-ports", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Serial Box
slug: generic-serial-box
console-server-ports:
  - name: Port 1
`);

      expect(result.inferredCategory).toBe("kvm");
    });

    it("ignores unnamed console port entries for kvm inference and the unsupported count", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Serial Box
slug: generic-serial-box
console-server-ports:
  - {}
console-ports:
  - name: ""
`);

      expect(result.inferredCategory).not.toBe("kvm");
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Skipped console server port: name"),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Skipped console port: name"),
      );
      expect(result.warnings).not.toContainEqual(
        expect.stringContaining("console port(s) are not yet supported"),
      );
    });

    it("warns about module bays, front ports and rear ports instead of dropping them silently", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Modular Box
slug: generic-modular-box
module-bays:
  - name: Slot 1
    position: "1"
front-ports:
  - name: Front 1
    type: 8p8c
    rear_port: Rear 1
rear-ports:
  - name: Rear 1
    type: 8p8c
`);

      expect(result.warnings).toContain(
        "1 module bay(s) are not yet supported by Rackula and were not imported",
      );
      expect(result.warnings).toContain(
        "1 front port(s) are not yet supported by Rackula and were not imported",
      );
      expect(result.warnings).toContain(
        "1 rear port(s) are not yet supported by Rackula and were not imported",
      );
    });

    it("still imports underscore keys from files already in circulation", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power_ports:
  - name: PSU1
device_bays:
  - name: Bay 1
module_bays:
  - name: Slot 1
`);

      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU1" });
      expect(result.deviceType.device_bays).toContainEqual({ name: "Bay 1" });
      expect(result.warnings).toContain(
        "1 module bay(s) are not yet supported by Rackula and were not imported",
      );
    });

    it("prefers the hyphenated list and warns when both spellings are present", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power-ports:
  - name: PSU1
power_ports:
  - name: Legacy PSU
`);

      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU1" });
      expect(result.deviceType.power_ports).not.toContainEqual({
        name: "Legacy PSU",
      });
      expect(result.warnings).toContain(
        'Both "power-ports" and "power_ports" are present, using "power-ports"',
      );
    });

    it("ignores a component key that is not a list, with a warning", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power-ports: iec-60320-c14
console-ports:
  name: Console
`);

      expect(result.deviceType.power_ports).toBeUndefined();
      expect(result.warnings).toContain(
        'Ignored "power-ports": expected a list',
      );
      expect(result.warnings).toContain(
        'Ignored "console-ports": expected a list',
      );
    });

    it("falls back to the underscore list when the hyphenated key is not a list", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power-ports: iec-60320-c14
power_ports:
  - name: PSU1
`);

      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU1" });
      expect(result.warnings).toContain(
        'Ignored "power-ports": expected a list',
      );
    });

    it("skips list items that are not mappings instead of throwing", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power-ports:
  - null
  - name: PSU1
device-bays:
  - Bay 1
`);

      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU1" });
      expect(result.deviceType.device_bays).toBeUndefined();
      expect(result.warnings).toContain(
        'Ignored 1 invalid item(s) in "power-ports"',
      );
      expect(result.warnings).toContain(
        'Ignored 1 invalid item(s) in "device-bays"',
      );
    });

    it("skips component items that fail validation and keeps the valid ones", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power-ports:
  - {}
  - name: PSU1
  - name: PSU2
    maximum_draw: 750W
power-outlets:
  - name: ""
  - name: Outlet 1
device-bays:
  - name: 42
  - name: Bay 1
inventory-items:
  - name: null
  - name: Fan Tray
`);

      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU1" });
      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU2" });
      expect(result.deviceType.power_outlets).toContainEqual({
        name: "Outlet 1",
      });
      expect(result.deviceType.device_bays).toContainEqual({ name: "Bay 1" });
      expect(result.deviceType.inventory_items).toContainEqual({
        name: "Fan Tray",
      });
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Dropped power port "PSU2" maximum_draw'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Skipped power port: name"),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Skipped power outlet: name"),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Skipped device bay: name"),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Skipped inventory item: name"),
      );
    });

    it("imports the null-valued component fields a NetBox device type export writes", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Chassis 2000
slug: generic-chassis-2000
power-ports:
  - name: PSU1
    type: null
    maximum_draw: null
    allocated_draw: null
    label: null
power-outlets:
  - name: Outlet 1
    type: null
    power_port: null
    feed_leg: null
inventory-items:
  - name: Fan Tray
    manufacturer: null
    part_id: null
`);

      expect(result.deviceType.power_ports).toContainEqual({ name: "PSU1" });
      expect(result.deviceType.power_outlets).toContainEqual({
        name: "Outlet 1",
      });
      expect(result.deviceType.inventory_items).toContainEqual({
        name: "Fan Tray",
      });
    });
  });

  describe("malformed input (#3336)", () => {
    async function importOk(yaml: string): Promise<ImportResult> {
      const imported = await importFromNetBoxYaml(yaml);
      if (!imported.success) {
        throw new Error(`expected success, got error: ${imported.error}`);
      }
      return imported.result;
    }

    it("imports weight: null as a device type without a weight", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Switch 24
slug: generic-switch-24
u_height: 1
weight: null
weight_unit: null
`);

      expect(result.deviceType.weight).toBeUndefined();
      expect(result.deviceType.weight_unit).toBeUndefined();
    });

    it("treats every null optional top-level scalar as absent", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Switch 24
slug: generic-switch-24
u_height: null
is_full_depth: null
part_number: null
airflow: null
front_image: null
rear_image: null
weight: null
weight_unit: null
subdevice_role: null
comments: null
interfaces: null
`);

      expect(result.deviceType.u_height).toBe(1);
      expect(result.deviceType.front_image).toBeUndefined();
      expect(result.deviceType.rear_image).toBeUndefined();
      expect(result.deviceType.notes).toBeUndefined();
      expect(result.deviceType.interfaces).toBeUndefined();
    });

    it("treats null optional interface fields as absent", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Switch 24
slug: generic-switch-24
interfaces:
  - name: eth0
    type: 1000base-t
    label: null
    mgmt_only: null
    poe_mode: null
    poe_type: null
`);

      expect(result.deviceType.interfaces).toContainEqual({
        name: "eth0",
        type: "1000base-t",
      });
    });

    it("warns and skips an interfaces value that is not a list", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Box
slug: generic-box
interfaces: foo
`);

      expect(result.deviceType.interfaces).toBeUndefined();
      expect(result.warnings).toContain(
        'Ignored "interfaces": expected a list',
      );
    });

    it("skips interface entries without a string type and keeps the valid ones", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Box
slug: generic-box
interfaces:
  - name: eth0
  - name: eth1
    type: 42
  - eth2
  - name: eth3
    type: 1000base-t
`);

      expect(result.deviceType.interfaces).toContainEqual({
        name: "eth3",
        type: "1000base-t",
      });
      expect(result.deviceType.interfaces).not.toContainEqual(
        expect.objectContaining({ name: "eth0" }),
      );
      expect(result.deviceType.interfaces).not.toContainEqual(
        expect.objectContaining({ name: "eth1" }),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Skipped interface "eth0": type'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Skipped interface "eth1": type'),
      );
      expect(result.warnings).toContain(
        'Ignored 1 invalid item(s) in "interfaces"',
      );
    });

    it("infers a category without throwing on malformed interfaces", () => {
      const malformed = [
        "foo",
        [{ name: "eth0" }],
        [{ name: "eth0", type: 42 }],
        [null],
      ];
      for (const interfaces of malformed) {
        expect(
          inferCategory(
            createTestNetBoxDeviceType({
              interfaces:
                interfaces as unknown as NetBoxDeviceType["interfaces"],
            }),
          ),
        ).toBe("other");
      }
    });

    it("keeps a power port with a zero draw and drops only the invalid field", async () => {
      const result = await importOk(`
manufacturer: Generic
model: PDU 8
slug: generic-pdu-8
power-ports:
  - name: PSU1
    type: iec-60320-c14
    maximum_draw: 0
    allocated_draw: 0
  - name: PSU2
    maximum_draw: 500
    allocated_draw: 0
`);

      expect(result.deviceType.power_ports).toContainEqual({
        name: "PSU1",
        type: "iec-60320-c14",
      });
      expect(result.deviceType.power_ports).toContainEqual({
        name: "PSU2",
        maximum_draw: 500,
      });
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Dropped power port "PSU1" maximum_draw'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Dropped power port "PSU1" allocated_draw'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Dropped power port "PSU2" allocated_draw'),
      );
    });

    it("keeps an interface with an invalid optional field and drops only that field", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Box
slug: generic-box
interfaces:
  - name: eth0
    type: 1000base-t
    mgmt_only: yes please
`);

      expect(result.deviceType.interfaces).toContainEqual({
        name: "eth0",
        type: "1000base-t",
      });
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Dropped interface "eth0" mgmt_only'),
      );
    });

    it("warns on a non-string airflow instead of throwing", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Box
slug: generic-box
airflow: 42
`);

      expect(result.deviceType.airflow).toBeUndefined();
      expect(result.warnings).toContain("Unknown airflow value: 42");
    });
  });

  describe("convertToDeviceType validation gate", () => {
    it.each([2.7, 0, -1, 99999])(
      "refuses out-of-range u_height %p instead of producing a DeviceType",
      (u_height) => {
        const converted = convertToDeviceType(
          createTestNetBoxDeviceType({ u_height }),
        );

        expect(converted.success).toBe(false);
        if (!converted.success) {
          expect(converted.error).toContain("u_height");
        }
      },
    );

    it.each([0.5, 50])("accepts boundary u_height %p", (u_height) => {
      const converted = convertToDeviceType(
        createTestNetBoxDeviceType({ u_height }),
      );

      expect(converted.success).toBe(true);
      if (converted.success) {
        expect(converted.result.deviceType.u_height).toBe(u_height);
      }
    });

    it("accepts an in-bounds half-U height", () => {
      const converted = convertToDeviceType(
        createTestNetBoxDeviceType({ u_height: 1.5 }),
      );

      expect(converted.success).toBe(true);
      if (converted.success) {
        expect(converted.result.deviceType.u_height).toBe(1.5);
      }
    });

    it.each([
      ["Weird Box", "weird-box"],
      ["My Switch!", "my-switch"],
      ["UPPER_CASE Name", "upper-case-name"],
    ])(
      "normalises an invalid slug %p to a SLUG_PATTERN-conforming slug",
      (slug, expected) => {
        const converted = convertToDeviceType(
          createTestNetBoxDeviceType({ slug }),
        );

        expect(converted.success).toBe(true);
        if (converted.success) {
          expect(converted.result.deviceType.slug).toBe(expected);
        }
      },
    );

    it("falls back to manufacturer/model when the slug normalises to empty", () => {
      const converted = convertToDeviceType(
        createTestNetBoxDeviceType({
          manufacturer: "Acme",
          model: "Rack Unit 1",
          slug: "!!!",
        }),
      );

      expect(converted.success).toBe(true);
      if (converted.success) {
        expect(converted.result.deviceType.slug).toBe("acme-rack-unit-1");
      }
    });

    it.each(["manufacturer", "model", "slug"] as const)(
      "refuses a non-string %s instead of throwing",
      (field) => {
        // A non-string scalar (e.g. `slug: 123` in the YAML) passes the
        // truthiness check in parseNetBoxYaml; the guard must return a clean
        // failure rather than throwing a TypeError inside a string helper.
        const converted = convertToDeviceType(
          createTestNetBoxDeviceType({
            [field]: 123,
          } as unknown as Partial<NetBoxDeviceType>),
        );

        expect(converted.success).toBe(false);
        if (!converted.success) {
          expect(converted.error).toContain(field);
        }
      },
    );

    it("suffixes the slug when it collides with an existing library slug", () => {
      // An existing "weird-box" plus an imported "Weird Box" both normalise to
      // "weird-box"; the import must get a distinct slug, not a duplicate.
      const converted = convertToDeviceType(
        createTestNetBoxDeviceType({ slug: "Weird Box" }),
        { existingSlugs: ["weird-box"] },
      );

      expect(converted.success).toBe(true);
      if (converted.success) {
        expect(converted.result.deviceType.slug).not.toBe("weird-box");
        expect(converted.result.deviceType.slug).toBe("weird-box-2");
      }
    });

    it("keeps the normalised slug when it does not collide", () => {
      const converted = convertToDeviceType(
        createTestNetBoxDeviceType({ slug: "Weird Box" }),
        { existingSlugs: ["something-else"] },
      );

      expect(converted.success).toBe(true);
      if (converted.success) {
        expect(converted.result.deviceType.slug).toBe("weird-box");
      }
    });

    it("round-trips a colliding import through parseLayoutObject without duplicate-slug rejection", () => {
      const existing = convertToDeviceType(
        createTestNetBoxDeviceType({ slug: "weird-box" }),
      );
      expect(existing.success).toBe(true);
      if (!existing.success) return;

      const imported = convertToDeviceType(
        createTestNetBoxDeviceType({ model: "Other Box", slug: "Weird Box" }),
        { existingSlugs: [existing.result.deviceType.slug] },
      );
      expect(imported.success).toBe(true);
      if (!imported.success) return;

      const layout = createTestLayout({
        device_types: [existing.result.deviceType, imported.result.deviceType],
      });

      // Mirror the autosave path: JSON serialize, then parse back. A duplicate
      // slug would make validateSlugUniqueness reject the layout (null result).
      const roundTripped = parseLayoutObject(
        JSON.parse(JSON.stringify(layout)),
      );

      expect(roundTripped).not.toBeNull();
    });

    it("round-trips an imported device through parseLayoutObject without rejection", () => {
      const converted = convertToDeviceType(
        createTestNetBoxDeviceType({
          manufacturer: "Ubiquiti",
          model: "USW Pro 24",
          slug: "Weird Box",
          u_height: 1,
        }),
      );

      expect(converted.success).toBe(true);
      if (!converted.success) return;

      const layout = createTestLayout({
        device_types: [converted.result.deviceType],
      });

      // Mirror the autosave path: JSON serialize, then parse back.
      const roundTripped = parseLayoutObject(
        JSON.parse(JSON.stringify(layout)),
      );

      expect(roundTripped).not.toBeNull();
      expect(roundTripped?.device_types[0]?.slug).toBe("weird-box");
    });
  });

  describe("importFromNetBoxYaml", () => {
    it("successfully imports valid YAML", async () => {
      const yaml = `
manufacturer: Ubiquiti
model: USW-Pro-48-PoE
slug: ubiquiti-usw-pro-48-poe
u_height: 1
is_full_depth: true
airflow: side-to-rear
front_image: true
rear_image: true
interfaces:
  - name: Port 1
    type: 1000base-t
    poe_mode: pse
`;
      const result = await importFromNetBoxYaml(yaml);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.deviceType.slug).toBe("ubiquiti-usw-pro-48-poe");
        expect(result.result.deviceType.category).toBe("network");
        // eslint-disable-next-line no-restricted-syntax -- Testing YAML import (exactly 1 interface)
        expect(result.result.deviceType.interfaces).toHaveLength(1);
        expect(result.result.deviceType.airflow).toBe("side-to-rear");
      }
    });

    it("allows category override", async () => {
      const yaml = `
manufacturer: Generic
model: Unknown Device
slug: generic-unknown-device
`;
      const result = await importFromNetBoxYaml(yaml, { category: "av-media" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.deviceType.category).toBe("av-media");
      }
    });

    it("returns error for invalid YAML", async () => {
      const yaml = "not: valid: yaml: format";
      const result = await importFromNetBoxYaml(yaml);

      expect(result.success).toBe(false);
    });
  });

  describe("parent and child device types (#2296)", () => {
    async function importOk(yaml: string): Promise<ImportResult> {
      const imported = await importFromNetBoxYaml(yaml);
      if (!imported.success) {
        throw new Error(`expected success, got error: ${imported.error}`);
      }
      return imported.result;
    }

    it("imports a parent with device bays as a container with one slot per bay", async () => {
      const result = await importOk(`
manufacturer: Acme
model: Chassis 3
slug: acme-chassis-3
u_height: 2
subdevice_role: parent
device-bays:
  - name: Bay A
  - name: Bay B
  - name: Bay C
`);

      const slots = result.deviceType.slots ?? [];
      expect(slots.map((s) => s.name)).toEqual(["Bay A", "Bay B", "Bay C"]);
      expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
      const cells = slots.map((s) => `${s.position.row},${s.position.col}`);
      expect(new Set(cells).size).toBe(slots.length);
      expect(result.deviceType.device_bays).toContainEqual({ name: "Bay A" });
      expect(result.warnings).toContainEqual(
        expect.stringContaining("approximate"),
      );
    });

    it("sizes generated slots so a half-width device fits each one", async () => {
      const bays = Array.from({ length: 5 }, (_, i) => `  - name: Bay ${i}`);
      const result = await importOk(`
manufacturer: Acme
model: Chassis 5
slug: acme-chassis-5
u_height: 6
subdevice_role: parent
device-bays:
${bays.join("\n")}
`);

      const slots = result.deviceType.slots ?? [];
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        // A half-width (slot_width 1) device needs width_fraction >= 0.5.
        expect(slot.width_fraction ?? 1).toBeGreaterThanOrEqual(0.5);
        expect(slot.height_units ?? 1).toBeGreaterThanOrEqual(1);
      }
      // The slots tile the device: their combined area is the whole face.
      const area = slots.reduce(
        (sum, s) => sum + (s.width_fraction ?? 1) * (s.height_units ?? 1),
        0,
      );
      expect(area).toBeCloseTo(6);
    });

    it("imports a bay whose name is longer than a slot name allows", async () => {
      const longName = "B".repeat(150);
      const result = await importOk(`
manufacturer: Acme
model: Chassis 1
slug: acme-chassis-1
subdevice_role: parent
device-bays:
  - name: ${longName}
`);

      expect(result.deviceType.slots?.[0]?.name).toBe(longName.slice(0, 100));
      expect(result.deviceType.device_bays).toContainEqual({ name: longName });
      expect(result.warnings).toContainEqual(
        expect.stringContaining("100 characters"),
      );
    });

    it("keeps slot names unique when shortened bay names collide", async () => {
      const prefix = "B".repeat(120);
      const result = await importOk(`
manufacturer: Acme
model: Chassis 2
slug: acme-chassis-2
subdevice_role: parent
device-bays:
  - name: ${prefix}x
  - name: ${prefix}y
`);

      const names = (result.deviceType.slots ?? []).map((s) => s.name ?? "");
      expect(names.length).toBeGreaterThan(1);
      expect(names.every((name) => name.length <= 100)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    });

    it("reuses a starter container's slot geometry when the slug matches", async () => {
      const carrier = findStarterDevice("carrier-1u-2x2");
      const starterSlots = carrier?.slots ?? [];
      expect(starterSlots.length).toBeGreaterThan(0);
      const bayNames = starterSlots.map((_, i) => `Cell ${i + 1}`);

      const result = await importOk(`
manufacturer: Generic
model: Carrier
slug: carrier-1u-2x2
u_height: 1
subdevice_role: parent
device-bays:
${bayNames.map((name) => `  - name: ${name}`).join("\n")}
`);

      expect(result.deviceType.slots).toEqual(
        starterSlots.map((slot, i) => ({ ...slot, name: bayNames[i] })),
      );
      expect(result.warnings).not.toContainEqual(
        expect.stringContaining("approximate"),
      );
    });

    it("generates slots when the bay count differs from the matching starter container", async () => {
      const result = await importOk(`
manufacturer: Generic
model: Carrier
slug: carrier-1u-2x2
u_height: 1
subdevice_role: parent
device-bays:
  - name: Only Bay
`);

      expect(result.deviceType.slots?.map((s) => s.name)).toEqual(["Only Bay"]);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("approximate"),
      );
    });

    it("imports a 0U child type with a height of 1 and a warning", async () => {
      const result = await importOk(`
manufacturer: Acme
model: Blade
slug: acme-blade
u_height: 0
subdevice_role: child
`);

      expect(result.deviceType.u_height).toBe(1);
      expect(result.deviceType.subdevice_role).toBe("child");
      expect(result.warnings).toContainEqual(
        expect.stringContaining("match the bay"),
      );
    });

    it("still rejects a 0U type that is not a child", async () => {
      const result = await importFromNetBoxYaml(`
manufacturer: Acme
model: Vertical PDU
slug: acme-vertical-pdu
u_height: 0
`);

      expect(result.success).toBe(false);
    });
  });
});
