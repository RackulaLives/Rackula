import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { createTestLayoutStore } from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    // Reset the store before each test
    resetLayoutStore();
  });

  describe("addRack", () => {
    it("creates rack with correct properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Main Rack", 42);
      expect(rack).not.toBeNull();
      expect(rack!.name).toBe("Main Rack");
      expect(rack!.height).toBe(42);
      expect(rack!.width).toBe(19);
      expect(rack!.devices).toEqual([]);
      // Multi-rack: uses generated nanoid
      expect(rack!.id).toBeDefined();
      expect(rack!.id.length).toBeGreaterThan(0);
    });

    it("adds new rack to the racks array", () => {
      const store = getLayoutStore();
      const initialCount = store.layout.racks.length;
      const rack = store.addRack("Test Rack", 42);
      expect(store.layout.racks.length).toBe(initialCount + 1);
      // New rack is added at the end
      const addedRack = store.layout.racks.find((r) => r.id === rack!.id);
      expect(addedRack).toBeDefined();
      expect(addedRack!.name).toBe("Test Rack");
      expect(addedRack!.height).toBe(42);
    });

    it("can add multiple racks", () => {
      const store = getLayoutStore();
      const initialCount = store.layout.racks.length;
      const rack1 = store.addRack("First Rack", 42);
      const rack2 = store.addRack("Second Rack", 24);
      expect(rack1).not.toBeNull();
      expect(rack2).not.toBeNull();
      expect(store.layout.racks.length).toBe(initialCount + 2);
      // Each rack has a unique ID
      expect(rack1!.id).not.toBe(rack2!.id);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
      store.addRack("Test", 42);
      expect(store.isDirty).toBe(true);
    });

    it("sets new rack as active rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("New Active Rack", 42);
      expect(store.rack.id).toBe(rack!.id);
    });
  });

  describe("addBayedRackGroup", () => {
    it("creates multiple racks with correct bay names", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: bayCount=2 creates exactly 2 racks
      expect(result!.racks).toHaveLength(2);
      expect(result!.racks[0].name).toBe("Bay 1");
      expect(result!.racks[1].name).toBe("Bay 2");
    });

    it("creates 3 bays when requested", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 3, 12);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: bayCount=3 creates exactly 3 racks
      expect(result!.racks).toHaveLength(3);
      expect(result!.racks[0].name).toBe("Bay 1");
      expect(result!.racks[1].name).toBe("Bay 2");
      expect(result!.racks[2].name).toBe("Bay 3");
    });

    it("creates racks with specified height", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 18);
      expect(result).not.toBeNull();
      expect(result!.racks[0].height).toBe(18);
      expect(result!.racks[1].height).toBe(18);
    });

    it("creates a rack group linking all racks", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      expect(result!.group.name).toBe("Server Bay");
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: rack_ids contains exactly bayCount IDs
      expect(result!.group.rack_ids).toHaveLength(2);
      expect(result!.group.rack_ids).toContain(result!.racks[0].id);
      expect(result!.group.rack_ids).toContain(result!.racks[1].id);
      expect(result!.group.layout_preset).toBe("bayed");
    });

    it("adds group to layout rack_groups", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: creating 1 group adds exactly 1 entry
      expect(store.rack_groups).toHaveLength(1);
      expect(store.rack_groups[0].id).toBe(result!.group.id);
    });

    it("sets first bay as active rack", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).not.toBeNull();
      expect(store.activeRackId).toBe(result!.racks[0].id);
    });

    it("returns null when capacity exceeded for 2 bays", () => {
      const store = getLayoutStore();
      // Add 9 racks (we start with 1 default rack, so total will be 10)
      for (let i = 0; i < 9; i++) {
        store.addRack(`Rack ${i}`, 42);
      }
      // Now at MAX_RACKS, can't add 2 more
      const result = store.addBayedRackGroup("Server Bay", 2, 12);
      expect(result).toBeNull();
    });

    it("returns null when capacity exceeded for 3 bays", () => {
      const store = getLayoutStore();
      // Add 8 racks (we start with 1 default rack, so total will be 9)
      for (let i = 0; i < 8; i++) {
        store.addRack(`Rack ${i}`, 42);
      }
      // Now at 9 racks, can't add 3 more
      const result = store.addBayedRackGroup("Server Bay", 3, 12);
      expect(result).toBeNull();
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      expect(store.isDirty).toBe(false);
      store.addBayedRackGroup("Server Bay", 2, 12);
      expect(store.isDirty).toBe(true);
    });

    it("marks hasStarted as true", () => {
      const store = getLayoutStore();
      expect(store.hasStarted).toBe(false);
      store.addBayedRackGroup("Server Bay", 2, 12);
      expect(store.hasStarted).toBe(true);
    });

    it("creates racks with non-default width (23 inch)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Wide Bay", 2, 12, 23);
      expect(result).not.toBeNull();
      expect(result!.racks[0].width).toBe(23);
      expect(result!.racks[1].width).toBe(23);
      expect(result!.group.id).toBeDefined();
      expect(result!.group.rack_ids).toContain(result!.racks[0].id);
      expect(result!.group.rack_ids).toContain(result!.racks[1].id);
    });
  });

  describe("updateRack", () => {
    it("modifies rack properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Original", 42);
      store.updateRack(rack!.id, { name: "Updated", height: 24 });
      const updatedRack = store.layout.racks.find((r) => r.id === rack!.id);
      expect(updatedRack!.name).toBe("Updated");
      expect(updatedRack!.height).toBe(24);
    });

    it("does not affect other rack properties", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Original", 42);
      store.updateRack(rack!.id, { name: "Updated" });
      const updatedRack = store.layout.racks.find((r) => r.id === rack!.id);
      expect(updatedRack!.height).toBe(42);
      expect(updatedRack!.width).toBe(19);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42);
      store.markClean();
      store.updateRack(rack!.id, { name: "Updated" });
      expect(store.isDirty).toBe(true);
    });

    it("propagates desc_units across a bayed group (#1520)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bayed", 3, 12);
      expect(result).not.toBeNull();
      // Sanity: all bays start with desc_units=false
      for (const r of result!.racks) {
        expect(r.desc_units).toBe(false);
      }

      // Edit the middle bay — the shared U-label column reads from racks[0],
      // and bays must stay in sync regardless of which one the user edits.
      store.updateRack(result!.racks[1].id, { desc_units: true });

      const groupRackIds = result!.racks.map((r) => r.id);
      const updated = store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      );
      for (const r of updated) {
        expect(r.desc_units).toBe(true);
      }
    });

    it("propagates starting_unit across a bayed group (#1520)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bayed", 2, 12);
      expect(result).not.toBeNull();

      store.updateRack(result!.racks[1].id, { starting_unit: 10 });

      const groupRackIds = result!.racks.map((r) => r.id);
      const updated = store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      );
      for (const r of updated) {
        expect(r.starting_unit).toBe(10);
      }
    });

    it("rejects a height change for a bayed-group member (#2222)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bayed", 2, 12);
      expect(result).not.toBeNull();
      const bay = result!.racks[0];
      expect(bay.height).toBe(12);

      // Bayed racks must stay the same height. The store silently rejects the
      // resize so the edit panel can revert its optimistic value (#2222).
      store.updateRack(bay.id, { height: 24 });

      const after = store.layout.racks.find((r) => r.id === bay.id)!;
      expect(after.height).toBe(12);
    });

    it("does not propagate non-numbering settings across a bayed group", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bayed", 2, 12);
      expect(result).not.toBeNull();

      store.updateRack(result!.racks[0].id, { name: "Renamed Bay 1" });

      const bay1 = store.layout.racks.find(
        (r) => r.id === result!.racks[0].id,
      )!;
      const bay2 = store.layout.racks.find(
        (r) => r.id === result!.racks[1].id,
      )!;
      expect(bay1.name).toBe("Renamed Bay 1");
      expect(bay2.name).toBe("Bay 2");
    });

    it("undoes bayed desc_units propagation atomically (#1520)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bayed", 3, 12);
      expect(result).not.toBeNull();
      const groupRackIds = result!.racks.map((r) => r.id);
      // Capture initial values rather than assuming defaults — keeps the
      // test honest if createDefaultRack's defaults change.
      const initialDesc = new Map(
        result!.racks.map((r) => [r.id, r.desc_units ?? false]),
      );

      store.updateRack(result!.racks[1].id, { desc_units: true });
      for (const r of store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      )) {
        expect(r.desc_units).toBe(true);
      }

      // One undo must revert ALL bays — otherwise the shared U-label column
      // ends up out of sync with the other bays.
      store.undo();
      for (const r of store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      )) {
        expect(r.desc_units).toBe(initialDesc.get(r.id));
      }

      store.redo();
      for (const r of store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      )) {
        expect(r.desc_units).toBe(true);
      }
    });

    it("undoes bayed starting_unit propagation atomically (#1520)", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bayed", 2, 12);
      expect(result).not.toBeNull();
      const groupRackIds = result!.racks.map((r) => r.id);
      // Capture initial values rather than assuming defaults — keeps the
      // test honest if createDefaultRack's defaults change.
      const initialStarting = new Map(
        result!.racks.map((r) => [r.id, r.starting_unit ?? 1]),
      );

      store.updateRack(result!.racks[0].id, { starting_unit: 10 });
      for (const r of store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      )) {
        expect(r.starting_unit).toBe(10);
      }

      store.undo();
      for (const r of store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      )) {
        expect(r.starting_unit).toBe(initialStarting.get(r.id));
      }

      store.redo();
      for (const r of store.layout.racks.filter((r) =>
        groupRackIds.includes(r.id),
      )) {
        expect(r.starting_unit).toBe(10);
      }
    });
  });

  describe("deleteRack", () => {
    it("removes rack from racks array", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("First", 42);
      const rack2 = store.addRack("Second", 24);
      const initialCount = store.layout.racks.length;
      store.deleteRack(rack1!.id);
      expect(store.layout.racks.length).toBe(initialCount - 1);
      expect(
        store.layout.racks.find((r) => r.id === rack1!.id),
      ).toBeUndefined();
      expect(store.layout.racks.find((r) => r.id === rack2!.id)).toBeDefined();
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test", 42);
      store.markClean();
      store.deleteRack(rack!.id);
      expect(store.isDirty).toBe(true);
    });

    it("updates active rack when deleting active rack", () => {
      const store = getLayoutStore();
      store.addRack("First", 42);
      const rack2 = store.addRack("Second", 24);
      // rack2 is now active (last added)
      expect(store.rack.id).toBe(rack2!.id);
      // Delete active rack
      store.deleteRack(rack2!.id);
      // Active rack should change to another rack
      expect(store.rack.id).not.toBe(rack2!.id);
    });
  });

  describe("reorderRacks", () => {
    it("reorders racks in array", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("First", 42);
      const rack2 = store.addRack("Second", 24);
      store.addRack("Third", 36);
      // Move rack1 to position 2 (after rack2)
      store.reorderRacks(
        store.layout.racks.findIndex((r) => r.id === rack1!.id),
        store.layout.racks.findIndex((r) => r.id === rack2!.id) + 1,
      );
      // Check order changed
      const rackIds = store.layout.racks.map((r) => r.id);
      expect(rackIds.indexOf(rack2!.id)).toBeLessThan(
        rackIds.indexOf(rack1!.id),
      );
    });

    it("is a no-op when reordering to same position", () => {
      const store = getLayoutStore();
      store.addRack("Only Rack", 42);
      store.markClean();
      // Reorder to same position should be no-op
      store.reorderRacks(0, 0);
      // isDirty should not change since no actual reorder happened
      expect(store.isDirty).toBe(false);
    });
  });

  describe("duplicateRack", () => {
    it("duplicates rack successfully in multi-rack mode", () => {
      const store = getLayoutStore();
      const rack = store.addRack("First Rack", 42);
      const result = store.duplicateRack(rack!.id);
      expect(result.rack).toBeDefined();
      expect(result.rack!.id).not.toBe(rack!.id); // Must have unique ID
      expect(result.rack!.name).toBe("First Rack (Copy)");
      expect(result.error).toBeUndefined();
    });
  });
});

describe("Layout name sync on first rack creation (#1482)", () => {
  it("syncs layout.name and metadata.name to the first rack's name", () => {
    const store = createTestLayoutStore({ layoutName: "My Layout" });
    expect(store.layout.name).toBe("My Layout");
    expect(store.layout.metadata?.name).toBe("My Layout");

    store.addRack("Server Rack A", 42);

    expect(store.layout.name).toBe("Server Rack A");
    expect(store.layout.metadata?.name).toBe("Server Rack A");
  });

  it("does NOT change layout.name when adding subsequent racks", () => {
    const store = createTestLayoutStore({ layoutName: "My Layout" });
    store.addRack("Server Rack A", 42);

    store.addRack("Server Rack B", 24);

    expect(store.layout.name).toBe("Server Rack A");
    expect(store.layout.metadata?.name).toBe("Server Rack A");
  });

  it("restores the original layout name when undoing the first rack creation", () => {
    const store = createTestLayoutStore({ layoutName: "Original Layout" });
    expect(store.layout.name).toBe("Original Layout");

    store.addRack("First Rack", 42);
    expect(store.layout.name).toBe("First Rack");

    store.undo();

    expect(store.layout.name).toBe("Original Layout");
    expect(store.layout.metadata?.name).toBe("Original Layout");
    expect(store.layout.racks.length).toBe(0);
  });

  it("does not touch layout.name when undoing a subsequent rack creation", () => {
    const store = createTestLayoutStore({ layoutName: "Original Layout" });
    store.addRack("First Rack", 42);
    const layoutNameAfterFirstRack = store.layout.name;
    expect(layoutNameAfterFirstRack).toBe("First Rack");

    store.addRack("Second Rack", 24);
    store.undo();

    // Undoing the second rack should leave layout.name as "First Rack",
    // not revert further back to "Original Layout"
    expect(store.layout.name).toBe(layoutNameAfterFirstRack);
    expect(store.layout.metadata?.name).toBe(layoutNameAfterFirstRack);
  });
});

describe("Raw mutators do not have layout-name side effects (#1481)", () => {
  it("updateRackRaw does not change layout.name", () => {
    const store = createTestLayoutStore({ layoutName: "Original Layout" });
    store.addRack("First Rack", 42);
    const beforeName = store.layout.name;

    // Call updateRackRaw directly (bypass recorded path)
    store.updateRackRaw({ name: "Renamed Rack" });

    expect(store.layout.name).toBe(beforeName);
    expect(store.layout.metadata?.name).toBe(beforeName);
  });

  it("undo of a rack settings change does not change layout.name", () => {
    const store = createTestLayoutStore({ layoutName: "My Layout" });
    store.addRack("First Rack", 42);
    const layoutNameBeforeUndo = store.layout.name;
    const activeRackId = store.activeRackId;
    expect(activeRackId).not.toBeNull();

    store.updateRack(activeRackId!, { height: 24 });
    store.undo();

    expect(store.layout.name).toBe(layoutNameBeforeUndo);
    expect(store.layout.metadata?.name).toBe(layoutNameBeforeUndo);
  });
});
