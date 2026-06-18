import { describe, it, expect, beforeEach } from "vitest";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import type { PlacedDevice } from "$lib/types";

describe("Selection Store", () => {
  beforeEach(() => {
    resetSelectionStore();
  });

  describe("device selection", () => {
    it("stores deviceId when selecting a device", () => {
      const store = getSelectionStore();

      store.selectDevice("rack-1", "device-uuid-1");

      expect(store.selectedDeviceId).toBe("device-uuid-1");
      expect(store.selectedRackId).toBe("rack-1");
      expect(store.selectedType).toBe("device");
    });

    it("selects by UUID, allowing multiple devices of same type to be distinguished", () => {
      const store = getSelectionStore();

      // Two devices with the same device_type but different UUIDs
      // Select the first one
      store.selectDevice("rack-1", "uuid-device-a1");

      expect(store.selectedDeviceId).toBe("uuid-device-a1");
      expect(store.selectedRackId).toBe("rack-1");

      // Select the second one
      store.selectDevice("rack-1", "uuid-device-a2");

      expect(store.selectedDeviceId).toBe("uuid-device-a2");
      expect(store.selectedRackId).toBe("rack-1");
    });

    it("clears selection correctly", () => {
      const store = getSelectionStore();

      store.selectDevice("rack-1", "device-uuid-1");
      store.clearSelection();

      expect(store.selectedDeviceId).toBeNull();
      expect(store.selectedRackId).toBeNull();
      expect(store.selectedType).toBeNull();
    });

    it("selecting a rack clears device id", () => {
      const store = getSelectionStore();

      store.selectDevice("rack-1", "device-uuid-1");
      store.selectRack("rack-1");

      expect(store.selectedDeviceId).toBeNull();
      expect(store.selectedType).toBe("rack");
    });
  });

  describe("isDeviceSelected helper", () => {
    it("returns true only for the exact device with the selected UUID", () => {
      const store = getSelectionStore();

      // Select device with uuid-1 in rack-1
      store.selectDevice("rack-1", "uuid-1");

      // Helper function to check if a specific device is selected
      const isSelected = (rackId: string, deviceId: string) =>
        store.selectedType === "device" &&
        store.selectedRackId === rackId &&
        store.selectedDeviceId === deviceId;

      // Device with uuid-1 should be selected
      expect(isSelected("rack-1", "uuid-1")).toBe(true);

      // Device with uuid-2 (same type but different UUID) should NOT be selected
      expect(isSelected("rack-1", "uuid-2")).toBe(false);

      // Device in different rack should NOT be selected
      expect(isSelected("rack-2", "uuid-1")).toBe(false);
    });
  });

  describe("getSelectedDeviceIndex helper", () => {
    it("converts device ID to array index", () => {
      const store = getSelectionStore();
      const devices: PlacedDevice[] = [
        { id: "uuid-a", device_type: "server", position: 1, face: "front" },
        { id: "uuid-b", device_type: "server", position: 3, face: "front" },
      ];

      store.selectDevice("rack-1", "uuid-b");

      // Should return index 1 (the position of uuid-b in the array)
      expect(store.getSelectedDeviceIndex(devices)).toBe(1);
    });

    it("returns null when device not found in array", () => {
      const store = getSelectionStore();
      const devices: PlacedDevice[] = [
        { id: "uuid-a", device_type: "server", position: 1, face: "front" },
      ];

      store.selectDevice("rack-1", "uuid-not-in-array");

      expect(store.getSelectedDeviceIndex(devices)).toBeNull();
    });
  });
});
