import { describe, it, expect } from "vitest";
import {
  searchDevices,
  groupDevicesByCategory,
  getCategoryDisplayName,
  sortDevicesByBrandThenModel,
  sortDevicesAlphabetically,
} from "$lib/utils/deviceFilters";
import type { DeviceType, DeviceCategory } from "$lib/types";

const createDevice = (
  slug: string,
  model: string,
  category: DeviceCategory,
  manufacturer?: string,
): DeviceType => ({
  slug,
  model,
  u_height: 1,
  colour: "#000000",
  category,
  manufacturer,
});

describe("deviceFilters", () => {
  describe("searchDevices", () => {
    const devices: DeviceType[] = [
      createDevice("1", "Server 1", "server"),
      createDevice("2", "Network Switch", "network"),
      createDevice("3", "Power Strip", "power"),
    ];

    it("returns all devices when query is empty", () => {
      expect(searchDevices(devices, "")).toEqual(devices);
      expect(searchDevices(devices, "   ")).toEqual(devices);
    });

    it("filters devices by name (case-insensitive)", () => {
      expect(searchDevices(devices, "server")).toHaveLength(1);
      expect(searchDevices(devices, "SERVER")).toHaveLength(1);
      expect(searchDevices(devices, "Server")).toHaveLength(1);
    });

    it("returns empty array when no matches", () => {
      expect(searchDevices(devices, "xyz")).toHaveLength(0);
    });

    it("matches partial strings", () => {
      expect(searchDevices(devices, "net")).toHaveLength(1);
      expect(searchDevices(devices, "pow")).toHaveLength(1);
    });

    it("matches manufacturer field", () => {
      const devicesWithManufacturer: DeviceType[] = [
        createDevice("r650", "PowerEdge R650", "server", "Dell"),
        createDevice("us-24", "USW-24", "network", "Ubiquiti"),
        createDevice("generic", "1U Server", "server"),
      ];
      const result = searchDevices(devicesWithManufacturer, "dell");
      expect(result).toHaveLength(1);
      expect(result[0].manufacturer).toBe("Dell");
    });

    it("matches category field", () => {
      const devicesWithCategories: DeviceType[] = [
        createDevice("r650", "PowerEdge R650", "server", "Dell"),
        createDevice("pdu", "Basic PDU", "power", "APC"),
      ];
      const result = searchDevices(devicesWithCategories, "server");
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe("server");
    });

    it("ranks model matches higher than manufacturer matches", () => {
      const devicesForRanking: DeviceType[] = [
        createDevice("r650", "PowerEdge R650", "server", "Dell"),
        createDevice("dell-server", "Dell Server Pro", "server", "Acme"),
      ];
      const result = searchDevices(devicesForRanking, "dell");
      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe("dell-server");
      expect(result[1].slug).toBe("r650");
    });

    it("ranks manufacturer matches higher than category matches", () => {
      const devicesForRanking: DeviceType[] = [
        createDevice("pdu", "Basic PDU", "power", "APC"),
        createDevice("ups", "Smart UPS", "power", "PowerTech"),
      ];
      const result = searchDevices(devicesForRanking, "power");
      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe("ups");
      expect(result[1].slug).toBe("pdu");
    });

    it("combines scores from multiple field matches", () => {
      const devicesForScoring: DeviceType[] = [
        createDevice("srv1", "Server Pro", "network", "Acme"),
        createDevice("srv2", "Server Basic", "server", "Acme"),
      ];
      const result = searchDevices(devicesForScoring, "server");
      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe("srv2");
      expect(result[1].slug).toBe("srv1");
    });

    it("handles case-insensitive matching across all fields", () => {
      const devicesForCase: DeviceType[] = [
        createDevice("r650", "PowerEdge R650", "server", "Dell"),
      ];
      expect(searchDevices(devicesForCase, "DELL")).toHaveLength(1);
      expect(searchDevices(devicesForCase, "dell")).toHaveLength(1);
      expect(searchDevices(devicesForCase, "SERVER")).toHaveLength(1);
    });
  });

  describe("groupDevicesByCategory", () => {
    const devices: DeviceType[] = [
      createDevice("1", "Server 1", "server"),
      createDevice("2", "Server 2", "server"),
      createDevice("3", "Switch", "network"),
    ];

    it("groups devices by category", () => {
      const groups = groupDevicesByCategory(devices);
      expect(groups.get("server")).toHaveLength(2);
      expect(groups.get("network")).toHaveLength(1);
    });

    it("returns empty map for empty array", () => {
      const groups = groupDevicesByCategory([]);
      expect(groups.size).toBe(0);
    });
  });

  describe("getCategoryDisplayName", () => {
    it("returns correct display names", () => {
      expect(getCategoryDisplayName("server")).toBe("Servers");
      expect(getCategoryDisplayName("network")).toBe("Network");
      expect(getCategoryDisplayName("patch-panel")).toBe("Patch Panels");
      expect(getCategoryDisplayName("power")).toBe("Power");
      expect(getCategoryDisplayName("storage")).toBe("Storage");
      expect(getCategoryDisplayName("kvm")).toBe("KVM");
      expect(getCategoryDisplayName("av-media")).toBe("AV/Media");
      expect(getCategoryDisplayName("cooling")).toBe("Cooling");
      expect(getCategoryDisplayName("blank")).toBe("Blanks");
      expect(getCategoryDisplayName("other")).toBe("Other");
    });
  });

  describe("sortDevicesByBrandThenModel", () => {
    it("sorts devices by manufacturer first, then by model", () => {
      const devices: DeviceType[] = [
        createDevice("dell-r740", "PowerEdge R740", "server", "Dell"),
        createDevice("hp-dl380", "ProLiant DL380", "server", "HPE"),
        createDevice("dell-r640", "PowerEdge R640", "server", "Dell"),
        createDevice("hp-dl360", "ProLiant DL360", "server", "HPE"),
      ];

      const sorted = sortDevicesByBrandThenModel(devices);

      // Dell devices first (alphabetically before HPE), sorted by model
      expect(sorted[0].slug).toBe("dell-r640");
      expect(sorted[1].slug).toBe("dell-r740");
      // Then HPE devices, sorted by model
      expect(sorted[2].slug).toBe("hp-dl360");
      expect(sorted[3].slug).toBe("hp-dl380");
    });

    it("handles devices without manufacturer (sorted last)", () => {
      const devices: DeviceType[] = [
        createDevice("generic-server", "Generic Server", "server"),
        createDevice("dell-r740", "PowerEdge R740", "server", "Dell"),
        createDevice("unknown-switch", "Switch 24", "network"),
      ];

      const sorted = sortDevicesByBrandThenModel(devices);

      // Dell first (has manufacturer)
      expect(sorted[0].slug).toBe("dell-r740");
      // Then devices without manufacturer, sorted by model
      expect(sorted[1].slug).toBe("generic-server");
      expect(sorted[2].slug).toBe("unknown-switch");
    });

    it("sorts case-insensitively", () => {
      const devices: DeviceType[] = [
        createDevice("ubiquiti-usg", "USG Pro", "network", "Ubiquiti"),
        createDevice("apc-ups", "Smart-UPS", "power", "APC"),
      ];

      const sorted = sortDevicesByBrandThenModel(devices);

      expect(sorted[0].slug).toBe("apc-ups");
      expect(sorted[1].slug).toBe("ubiquiti-usg");
    });

    it("returns empty array for empty input", () => {
      expect(sortDevicesByBrandThenModel([])).toEqual([]);
    });

    it("does not mutate original array", () => {
      const devices: DeviceType[] = [
        createDevice("b-device", "Bravo", "server", "Zebra"),
        createDevice("a-device", "Alpha", "server", "Alpha"),
      ];
      const original = [...devices];

      sortDevicesByBrandThenModel(devices);

      expect(devices).toEqual(original);
    });
  });

  describe("sortDevicesAlphabetically", () => {
    it("sorts devices alphabetically by model name", () => {
      const devices: DeviceType[] = [
        createDevice("server-c", "Zebra Server", "server"),
        createDevice("server-a", "Alpha Server", "server"),
        createDevice("server-b", "Bravo Switch", "network"),
      ];

      const sorted = sortDevicesAlphabetically(devices);

      expect(sorted[0].model).toBe("Alpha Server");
      expect(sorted[1].model).toBe("Bravo Switch");
      expect(sorted[2].model).toBe("Zebra Server");
    });

    it("sorts case-insensitively", () => {
      const devices: DeviceType[] = [
        createDevice("upper", "UPPER CASE", "server"),
        createDevice("lower", "lower case", "server"),
        createDevice("mixed", "Mixed Case", "server"),
      ];

      const sorted = sortDevicesAlphabetically(devices);

      expect(sorted[0].model).toBe("lower case");
      expect(sorted[1].model).toBe("Mixed Case");
      expect(sorted[2].model).toBe("UPPER CASE");
    });

    it("falls back to slug when model is undefined", () => {
      const devices: DeviceType[] = [
        createDevice("zebra-device", undefined as unknown as string, "server"),
        createDevice("alpha-device", undefined as unknown as string, "server"),
      ];

      const sorted = sortDevicesAlphabetically(devices);

      expect(sorted[0].slug).toBe("alpha-device");
      expect(sorted[1].slug).toBe("zebra-device");
    });

    it("returns empty array for empty input", () => {
      expect(sortDevicesAlphabetically([])).toEqual([]);
    });

    it("does not mutate original array", () => {
      const devices: DeviceType[] = [
        createDevice("b-device", "Bravo", "server"),
        createDevice("a-device", "Alpha", "server"),
      ];
      const original = [...devices];

      sortDevicesAlphabetically(devices);

      expect(devices).toEqual(original);
    });
  });
});
