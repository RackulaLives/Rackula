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

  describe("initial state", () => {
    it("has no selection", () => {
      const store = getSelectionStore();
      expect(store.selectedType).toBeNull();
      expect(store.selectedRackId).toBeNull();
      expect(store.selectedDeviceId).toBeNull();
    });

    it("hasSelection returns false", () => {
      const store = getSelectionStore();
      expect(store.hasSelection).toBe(false);
    });

    it("isRackSelected returns false", () => {
      const store = getSelectionStore();
      expect(store.isRackSelected).toBe(false);
    });

    it("isDeviceSelected returns false", () => {
      const store = getSelectionStore();
      expect(store.isDeviceSelected).toBe(false);
    });
  });

  describe("selectRack", () => {
    it("sets selectedRackId and selectedType to rack", () => {
      const store = getSelectionStore();
      store.selectRack("rack-123");
      expect(store.selectedRackId).toBe("rack-123");
      expect(store.selectedType).toBe("rack");
    });

    it("clears previous device selection", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-123");
      expect(store.selectedType).toBe("device");

      store.selectRack("rack-2");
      expect(store.selectedType).toBe("rack");
      expect(store.selectedRackId).toBe("rack-2");
      expect(store.selectedDeviceId).toBeNull();
    });

    it("hasSelection returns true when rack selected", () => {
      const store = getSelectionStore();
      store.selectRack("rack-123");
      expect(store.hasSelection).toBe(true);
    });

    it("isRackSelected returns true when rack selected", () => {
      const store = getSelectionStore();
      store.selectRack("rack-123");
      expect(store.isRackSelected).toBe(true);
    });

    it("isDeviceSelected returns false when rack selected", () => {
      const store = getSelectionStore();
      store.selectRack("rack-123");
      expect(store.isDeviceSelected).toBe(false);
    });
  });

  describe("selectDevice", () => {
    it("sets selectedDeviceId, selectedType, and selectedRackId", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-123");
      expect(store.selectedDeviceId).toBe("device-uuid-123");
      expect(store.selectedType).toBe("device");
      expect(store.selectedRackId).toBe("rack-1");
    });

    it("clears previous rack selection", () => {
      const store = getSelectionStore();
      store.selectRack("rack-1");
      expect(store.selectedType).toBe("rack");

      store.selectDevice("rack-2", "device-uuid-123");
      expect(store.selectedType).toBe("device");
      expect(store.selectedDeviceId).toBe("device-uuid-123");
    });

    it("hasSelection returns true when device selected", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-123");
      expect(store.hasSelection).toBe(true);
    });

    it("isRackSelected returns false when device selected", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-123");
      expect(store.isRackSelected).toBe(false);
    });

    it("isDeviceSelected returns true when device selected", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-123");
      expect(store.isDeviceSelected).toBe(true);
    });
  });

  describe("clearSelection", () => {
    it("resets all selection state", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-123");
      expect(store.hasSelection).toBe(true);

      store.clearSelection();
      expect(store.selectedType).toBeNull();
      expect(store.selectedRackId).toBeNull();
      expect(store.selectedDeviceId).toBeNull();
    });

    it("hasSelection returns false after clearing", () => {
      const store = getSelectionStore();
      store.selectRack("rack-1");
      store.clearSelection();
      expect(store.hasSelection).toBe(false);
    });
  });

  describe("getSelectedDeviceIndex", () => {
    it("returns the index of the selected device in the array", () => {
      const store = getSelectionStore();
      const devices: PlacedDevice[] = [
        { id: "uuid-1", device_type: "server", position: 1, face: "front" },
        { id: "uuid-2", device_type: "switch", position: 5, face: "front" },
        { id: "uuid-3", device_type: "server", position: 10, face: "rear" },
      ];

      store.selectDevice("rack-1", "uuid-2");
      expect(store.getSelectedDeviceIndex(devices)).toBe(1);
    });

    it("returns null when no device is selected", () => {
      const store = getSelectionStore();
      const devices: PlacedDevice[] = [
        { id: "uuid-1", device_type: "server", position: 1, face: "front" },
      ];

      expect(store.getSelectedDeviceIndex(devices)).toBeNull();
    });

    it("returns null when selected device is not in array", () => {
      const store = getSelectionStore();
      const devices: PlacedDevice[] = [
        { id: "uuid-1", device_type: "server", position: 1, face: "front" },
      ];

      store.selectDevice("rack-1", "uuid-not-found");
      expect(store.getSelectedDeviceIndex(devices)).toBeNull();
    });
  });

  describe("hasSelection derived", () => {
    it("returns true when rack selected", () => {
      const store = getSelectionStore();
      store.selectRack("rack-1");
      expect(store.hasSelection).toBe(true);
    });

    it("returns true when device selected", () => {
      const store = getSelectionStore();
      store.selectDevice("rack-1", "device-uuid-1");
      expect(store.hasSelection).toBe(true);
    });

    it("returns false when nothing selected", () => {
      const store = getSelectionStore();
      expect(store.hasSelection).toBe(false);
    });
  });
});
