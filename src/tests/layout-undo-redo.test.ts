import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";

describe("Layout Store - Undo/Redo Integration", () => {
  let initialDeviceTypeCount: number;

  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    const store = getLayoutStore();
    initialDeviceTypeCount = store.device_types.length;
  });

  describe("Device Type Operations", () => {
    it("addDeviceTypeRecorded can be undone", () => {
      const store = getLayoutStore();

      store.addDeviceTypeRecorded({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      expect(store.device_types.length).toBe(initialDeviceTypeCount + 1);
      expect(store.canUndo).toBe(true);

      store.undo();

      expect(store.device_types.length).toBe(initialDeviceTypeCount);
      expect(store.canUndo).toBe(false);
    });

    it("addDeviceTypeRecorded can be redone after undo", () => {
      const store = getLayoutStore();

      store.addDeviceTypeRecorded({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      store.undo();
      expect(store.device_types.length).toBe(initialDeviceTypeCount);
      expect(store.canRedo).toBe(true);

      store.redo();
      expect(store.device_types.length).toBe(initialDeviceTypeCount + 1);
    });

    it("updateDeviceTypeRecorded can be undone", () => {
      const store = getLayoutStore();

      const dt = store.addDeviceTypeRecorded({
        name: "Test Server",
        model: "Original Model",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      store.updateDeviceTypeRecorded(dt.slug, { model: "Updated Model" });
      const updated = store.device_types.find((d) => d.slug === dt.slug);
      expect(updated?.model).toBe("Updated Model");

      store.undo();
      const restored = store.device_types.find((d) => d.slug === dt.slug);
      expect(restored?.model).toBe("Original Model");
    });

    it("deleteDeviceTypeRecorded can be undone", () => {
      const store = getLayoutStore();

      const dt = store.addDeviceTypeRecorded({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });
      const countAfterAdd = store.device_types.length;

      store.deleteDeviceTypeRecorded(dt.slug);
      expect(store.device_types.length).toBe(countAfterAdd - 1);

      store.undo();
      expect(store.device_types.length).toBe(countAfterAdd);
    });

    it("deleteDeviceTypeRecorded restores placed devices on undo", () => {
      const store = getLayoutStore();
      const rack = store.rack;

      const dt = store.addDeviceTypeRecorded({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });
      const countAfterAdd = store.device_types.length;

      store.placeDeviceRecorded(rack.id, dt.slug, 5);
      expect(store.rack.devices.length).toBe(1);

      store.deleteDeviceTypeRecorded(dt.slug);
      expect(store.device_types.length).toBe(countAfterAdd - 1);
      expect(store.rack.devices.length).toBe(0);

      // Undo the delete
      store.undo();
      expect(store.device_types.length).toBe(countAfterAdd);
      expect(store.rack.devices.length).toBe(1);
      expect(store.rack.devices[0]?.position).toBe(5);
    });
  });

  describe("Device Operations", () => {
    beforeEach(() => {
      const store = getLayoutStore();
      store.addDeviceTypeRecorded({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });
      // Clear history from adding device type
      store.clearHistory();
    });

    it("placeDeviceRecorded can be undone", () => {
      const store = getLayoutStore();
      const rack = store.rack;
      const dt = store.device_types[0]!;

      store.placeDeviceRecorded(rack.id, dt.slug, 10);
      expect(store.rack.devices.length).toBe(1);

      store.undo();
      expect(store.rack.devices.length).toBe(0);
    });

    it("moveDeviceRecorded can be undone", () => {
      const store = getLayoutStore();
      const rack = store.rack;
      const dt = store.device_types[0]!;

      store.placeDeviceRecorded(rack.id, dt.slug, 10);
      store.moveDeviceRecorded(rack.id, 0, 20);
      expect(store.rack.devices[0]?.position).toBe(20);

      store.undo();
      expect(store.rack.devices[0]?.position).toBe(10);
    });

    it("removeDeviceRecorded can be undone", () => {
      const store = getLayoutStore();
      const rack = store.rack;
      const dt = store.device_types[0]!;

      store.placeDeviceRecorded(rack.id, dt.slug, 10);
      store.removeDeviceRecorded(rack.id, 0);
      expect(store.rack.devices.length).toBe(0);

      store.undo();
      expect(store.rack.devices.length).toBe(1);
      expect(store.rack.devices[0]?.position).toBe(10);
    });

    it("updateDeviceFaceRecorded can be undone", () => {
      const store = getLayoutStore();
      const rack = store.rack;
      const dt = store.device_types[0]!;

      store.placeDeviceRecorded(rack.id, dt.slug, 10);
      // Full-depth devices (is_full_depth undefined or true) default to 'both' face
      const originalFace = store.rack.devices[0]?.face;
      expect(originalFace).toBe("both");

      store.updateDeviceFaceRecorded(rack.id, 0, "rear");
      expect(store.rack.devices[0]?.face).toBe("rear");

      store.undo();
      expect(store.rack.devices[0]?.face).toBe("both");
    });
  });

  describe("Rack Operations", () => {
    it("updateRackRecorded can be undone", () => {
      const store = getLayoutStore();
      const rack = store.rack;
      const originalHeight = rack.height;

      store.updateRackRecorded(rack.id, { height: 48 });
      expect(store.rack.height).toBe(48);

      store.undo();
      expect(store.rack.height).toBe(originalHeight);
    });

    it("clearRackRecorded can be undone", () => {
      const store = getLayoutStore();
      const rack = store.rack;

      store.addDeviceTypeRecorded({
        name: "Test Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });
      const dt = store.device_types[0]!;

      store.placeDeviceRecorded(rack.id, dt.slug, 5);
      store.placeDeviceRecorded(rack.id, dt.slug, 15);
      expect(store.rack.devices.length).toBe(2);

      store.clearRackRecorded();
      expect(store.rack.devices.length).toBe(0);

      store.undo();
      expect(store.rack.devices.length).toBe(2);
    });
  });

  describe("Undo/Redo State", () => {
    it("canUndo is false when no actions", () => {
      const store = getLayoutStore();
      expect(store.canUndo).toBe(false);
    });

    it("canRedo is false when no undone actions", () => {
      const store = getLayoutStore();
      expect(store.canRedo).toBe(false);
    });

    it("undoDescription shows last action", () => {
      const store = getLayoutStore();

      store.addDeviceTypeRecorded({
        name: "Test Server",
        model: "Dell PowerEdge",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      expect(store.undoDescription).toBe("Undo: Add Dell PowerEdge");
    });

    it("redoDescription shows next redo action", () => {
      const store = getLayoutStore();

      store.addDeviceTypeRecorded({
        name: "Test Server",
        model: "Dell PowerEdge",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      store.undo();
      expect(store.redoDescription).toBe("Redo: Add Dell PowerEdge");
    });

    it("new action clears redo stack", () => {
      const store = getLayoutStore();

      store.addDeviceTypeRecorded({
        name: "Server 1",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      store.undo();
      expect(store.canRedo).toBe(true);

      store.addDeviceTypeRecorded({
        name: "Server 2",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      expect(store.canRedo).toBe(false);
    });

    it("clearHistory removes all history", () => {
      const store = getLayoutStore();

      store.addDeviceTypeRecorded({
        name: "Server 1",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      store.addDeviceTypeRecorded({
        name: "Server 2",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });

      store.undo();
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(true);

      store.clearHistory();
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
    });
  });

  describe("Multiple Operations", () => {
    it("can undo multiple operations in sequence", () => {
      const store = getLayoutStore();
      const rack = store.rack;

      const dt = store.addDeviceTypeRecorded({
        name: "Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });
      const countAfterAdd = store.device_types.length;

      store.placeDeviceRecorded(rack.id, dt.slug, 5);
      store.moveDeviceRecorded(rack.id, 0, 15);

      // State: device at position 15
      expect(store.rack.devices[0]?.position).toBe(15);

      store.undo(); // Undo move
      expect(store.rack.devices[0]?.position).toBe(5);

      store.undo(); // Undo place
      expect(store.rack.devices.length).toBe(0);

      store.undo(); // Undo add device type
      expect(store.device_types.length).toBe(countAfterAdd - 1);
    });

    it("can redo multiple operations in sequence", () => {
      const store = getLayoutStore();
      const rack = store.rack;

      const dt = store.addDeviceTypeRecorded({
        name: "Server",
        u_height: 2,
        category: "server",
        colour: "#336699",
      });
      const countAfterAdd = store.device_types.length;

      store.placeDeviceRecorded(rack.id, dt.slug, 5);
      store.moveDeviceRecorded(rack.id, 0, 15);

      store.undo();
      store.undo();
      store.undo();

      // All undone
      expect(store.device_types.length).toBe(countAfterAdd - 1);

      store.redo(); // Redo add device type
      expect(store.device_types.length).toBe(countAfterAdd);

      store.redo(); // Redo place
      expect(store.rack.devices.length).toBe(1);
      expect(store.rack.devices[0]?.position).toBe(5);

      store.redo(); // Redo move
      expect(store.rack.devices[0]?.position).toBe(15);
    });
  });
});
