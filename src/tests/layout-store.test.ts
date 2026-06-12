import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import type { Layout } from "$lib/types";
import { VERSION } from "$lib/version";
import { createTestDeviceTypeInput } from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    // Reset the store before each test
    resetLayoutStore();
  });

  describe("initial state", () => {
    it("initializes with correct app version", () => {
      const store = getLayoutStore();
      expect(store.layout.name).toBe("My Layout");
      expect(store.layout.version).toBe(VERSION);
      // Starts with empty racks array - user creates first rack via wizard
      expect(store.layout.racks).toEqual([]);
      // device_types starts empty (starter library is a runtime constant, not stored)
      expect(store.layout.device_types.length).toBe(0);
    });

    it("initializes isDirty as false", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
    });

    it("initializes hasRack as false before user adds a rack", () => {
      const store = getLayoutStore();
      expect(store.hasRack).toBe(false);
      // After adding a rack, hasRack is true
      store.addRack("Test Rack", 42);
      expect(store.hasRack).toBe(true);
    });

    it("rackCount starts at 0 and increases when racks are added", () => {
      const store = getLayoutStore();
      // Starts with 0 racks
      expect(store.rackCount).toBe(0);
      // After adding a rack, count is 1
      store.addRack("Test Rack", 42);
      expect(store.rackCount).toBe(1);
    });

    it("canAddRack is true when under MAX_RACKS", () => {
      const store = getLayoutStore();
      expect(store.canAddRack).toBe(true);
    });

    it("rack returns null when no racks exist", () => {
      const store = getLayoutStore();
      expect(store.rack).toBeNull();
    });
  });

  describe("createNewLayout", () => {
    it("creates a new layout with the given name", () => {
      const store = getLayoutStore();
      store.createNewLayout("My Lab");
      expect(store.layout.name).toBe("My Lab");
    });

    it("creates empty layout with no racks", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);
      store.createNewLayout("New Layout");
      // New layouts start with no racks - user creates first rack via wizard
      expect(store.layout.racks).toEqual([]);
    });

    it("resets device_types to empty array", () => {
      const store = getLayoutStore();
      store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.createNewLayout("New Layout");
      // device_types starts empty (starter library is a runtime constant, not stored)
      expect(store.device_types.length).toBe(0);
    });

    it("sets isDirty to false", () => {
      const store = getLayoutStore();
      store.addRack("Test", 42);
      expect(store.isDirty).toBe(true);
      store.createNewLayout("New Layout");
      expect(store.isDirty).toBe(false);
    });
  });

  describe("loadLayout", () => {
    it("loads a v0.2 layout directly", () => {
      const store = getLayoutStore();
      const v02Layout: Layout = {
        version: "0.2.0",
        name: "Test Layout",
        racks: [
          {
            id: "rack-1",
            name: "Test Rack",
            height: 24,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [],
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };
      store.loadLayout(v02Layout);
      expect(store.layout.name).toBe("Test Layout");
      expect(store.layout.racks[0].height).toBe(24);
    });

    it("sets isDirty to false", () => {
      const store = getLayoutStore();
      store.markDirty();
      expect(store.isDirty).toBe(true);
      store.loadLayout({
        version: "0.2.0",
        name: "Test",
        racks: [
          {
            id: "rack-1",
            name: "Test",
            height: 42,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [],
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      });
      expect(store.isDirty).toBe(false);
    });

    it("deduplicates device IDs within a rack (#1363)", () => {
      const store = getLayoutStore();
      store.loadLayout({
        version: "0.7.0",
        name: "Dupe Device Test",
        racks: [
          {
            id: "rack-1",
            name: "Test Rack",
            height: 42,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [
              {
                id: "same-id",
                device_type: "server-a",
                position: 100,
                face: "front" as const,
              },
              {
                id: "same-id",
                device_type: "server-b",
                position: 200,
                face: "front" as const,
              },
              {
                id: "ok-id",
                device_type: "server-c",
                position: 300,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [
          {
            slug: "server-a",
            u_height: 1,
            colour: "#4A90A4",
            category: "server" as const,
          },
          {
            slug: "server-b",
            u_height: 1,
            colour: "#4A90A4",
            category: "server" as const,
          },
          {
            slug: "server-c",
            u_height: 1,
            colour: "#4A90A4",
            category: "server" as const,
          },
        ],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      });

      const devices = store.layout.racks[0].devices;
      const ids = devices.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
      // First keeps original, second gets regenerated
      expect(ids[0]).toBe("same-id");
      expect(ids[1]).not.toBe("same-id");
      expect(ids[2]).toBe("ok-id");
    });

    it("regenerates empty device IDs (#1363)", () => {
      const store = getLayoutStore();
      store.loadLayout({
        version: "0.7.0",
        name: "Empty ID Test",
        racks: [
          {
            id: "rack-1",
            name: "Test Rack",
            height: 42,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [
              {
                id: "",
                device_type: "server-a",
                position: 100,
                face: "front" as const,
              },
              {
                id: "valid-id",
                device_type: "server-b",
                position: 200,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [
          {
            slug: "server-a",
            u_height: 1,
            colour: "#4A90A4",
            category: "server" as const,
          },
          {
            slug: "server-b",
            u_height: 1,
            colour: "#4A90A4",
            category: "server" as const,
          },
        ],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      });

      const devices = store.layout.racks[0].devices;
      // Empty ID should be regenerated
      expect(devices[0].id.length).toBeGreaterThan(0);
      expect(devices[0].id).not.toBe("");
      expect(devices[1].id).toBe("valid-id");
    });
  });

  describe("dirty tracking", () => {
    it("markDirty sets isDirty to true", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
      store.markDirty();
      expect(store.isDirty).toBe(true);
    });

    it("markClean sets isDirty to false", () => {
      const store = getLayoutStore();
      store.markDirty();
      expect(store.isDirty).toBe(true);
      store.markClean();
      expect(store.isDirty).toBe(false);
    });
  });

  describe("resetLayout", () => {
    it("resets to initial state", () => {
      const store = getLayoutStore();
      store.addRack("Test", 42);
      store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );

      resetLayoutStore();
      const freshStore = getLayoutStore();

      expect(freshStore.layout.name).toBe("My Layout");
      // Racks array starts empty - user creates first rack via wizard
      expect(freshStore.layout.racks).toEqual([]);
      // device_types starts empty (starter library is a runtime constant, not stored)
      expect(freshStore.device_types.length).toBe(0);
      expect(freshStore.isDirty).toBe(false);
    });
  });

  describe("settings", () => {
    it("updateDisplayMode updates display_mode", () => {
      const store = getLayoutStore();
      expect(store.layout.settings.display_mode).toBe("label");
      store.updateDisplayMode("image");
      expect(store.layout.settings.display_mode).toBe("image");
      expect(store.isDirty).toBe(true);
    });

    it("updateShowLabelsOnImages updates show_labels_on_images", () => {
      const store = getLayoutStore();
      expect(store.layout.settings.show_labels_on_images).toBe(false);
      store.updateShowLabelsOnImages(true);
      expect(store.layout.settings.show_labels_on_images).toBe(true);
      expect(store.isDirty).toBe(true);
    });
  });
});
