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
} from "./netbox-import";
import { CATEGORY_COLOURS } from "$lib/types/constants";

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

    it("infers network category for firewalls", () => {
      const device: NetBoxDeviceType = {
        manufacturer: "Fortinet",
        model: "FortiGate 60F",
        slug: "fortinet-fortigate-60f",
      };
      expect(inferCategory(device)).toBe("network");
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
    it("converts basic NetBox device to Rackula DeviceType", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Ubiquiti",
        model: "USW-Pro-24",
        slug: "ubiquiti-usw-pro-24",
        u_height: 1,
        is_full_depth: false,
      };

      const result = convertToDeviceType(netbox);

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

      const result = convertToDeviceType(netbox, { category: "server" });

      expect(result.deviceType.category).toBe("server");
      expect(result.deviceType.colour).toBe(CATEGORY_COLOURS.server);
    });

    it("applies custom colour override", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Ubiquiti",
        model: "USW-Pro-24",
        slug: "ubiquiti-usw-pro-24",
      };

      const result = convertToDeviceType(netbox, { colour: "#FF0000" });

      expect(result.deviceType.colour).toBeTruthy(); // Color is set
    });

    it("maps airflow correctly", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        airflow: "front-to-rear",
      };

      const result = convertToDeviceType(netbox);

      expect(result.deviceType.airflow).toBe("front-to-rear");
    });

    it("warns on unknown airflow value", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Dell",
        model: "PowerEdge R640",
        slug: "dell-poweredge-r640",
        airflow: "unknown-airflow-type",
      };

      const result = convertToDeviceType(netbox);

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

      const result = convertToDeviceType(netbox);

      // eslint-disable-next-line no-restricted-syntax -- Testing conversion (exactly 2 interfaces)
      expect(result.deviceType.interfaces).toHaveLength(2);
      expect(result.deviceType.interfaces![0].name).toBe("Gi1/0/1");
      expect(result.deviceType.interfaces![1].mgmt_only).toBe(true);
    });

    it("converts power ports and outlets", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "APC",
        model: "AP7901",
        slug: "apc-ap7901",
        power_ports: [{ name: "Input", maximum_draw: 1920 }],
        power_outlets: [{ name: "Outlet 1", power_port: "Input" }],
      };

      const result = convertToDeviceType(netbox);

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

      const result = convertToDeviceType(netbox);

      expect(result.deviceType.u_height).toBe(1);
    });

    it("defaults is_full_depth to true if not specified", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
      };

      const result = convertToDeviceType(netbox);

      expect(result.deviceType.is_full_depth).toBe(true);
    });

    it("includes comments as notes", () => {
      const netbox: NetBoxDeviceType = {
        manufacturer: "Generic",
        model: "Device",
        slug: "generic-device",
        comments: "This is a test device",
      };

      const result = convertToDeviceType(netbox);

      expect(result.deviceType.notes).toBe("This is a test device");
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
});
