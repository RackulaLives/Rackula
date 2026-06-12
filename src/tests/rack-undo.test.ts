/**
 * Rack Add/Delete Undo/Redo Tests
 *
 * Tests for undoing and redoing rack creation and deletion.
 * Verifies that group memberships are properly restored on undo.
 *
 * Issue: #559 - Make Rack Add/Delete Undoable
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getHistoryStore, resetHistoryStore } from "$lib/stores/history.svelte";
import { updateRackRecorded } from "$lib/stores/layout/recorded-rack-actions";
import type { LayoutStateAccess } from "$lib/stores/layout/types";
import {
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("Rack Add/Delete Undo/Redo", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
  });

  // Note: resetLayoutStore creates an initial layout with 1 default rack
  // Tests account for this baseline state

  describe("addRack undo/redo", () => {
    it("undoes rack creation", () => {
      const store = getLayoutStore();
      const initialRackCount = store.racks.length;
      store.clearHistory();

      const rack = store.addRack("Test Rack", 42);
      expect(rack).not.toBeNull();
      expect(store.racks.length).toBe(initialRackCount + 1);
      expect(store.getRackById(rack!.id)).toBeDefined();

      store.undo();

      expect(store.racks.length).toBe(initialRackCount);
      expect(store.getRackById(rack!.id)).toBeUndefined();
    });

    it("redoes rack creation after undo", () => {
      const store = getLayoutStore();
      const initialRackCount = store.racks.length;
      store.clearHistory();

      const rack = store.addRack("Test Rack", 42);
      const rackId = rack!.id;

      store.undo();
      expect(store.racks.length).toBe(initialRackCount);

      store.redo();

      expect(store.racks.length).toBe(initialRackCount + 1);
      expect(store.getRackById(rackId)).toBeDefined();
      expect(store.getRackById(rackId)!.name).toBe("Test Rack");
    });

    it("preserves rack properties on redo", () => {
      const store = getLayoutStore();
      store.clearHistory();

      const rack = store.addRack("Custom Rack", 24, 19, "2-post", true, 5);

      store.undo();
      store.redo();

      const restored = store.getRackById(rack!.id);
      expect(restored).toBeDefined();
      expect(restored!.name).toBe("Custom Rack");
      expect(restored!.height).toBe(24);
      expect(restored!.width).toBe(19);
      expect(restored!.form_factor).toBe("2-post");
      expect(restored!.desc_units).toBe(true);
      expect(restored!.starting_unit).toBe(5);
    });

    it("allows multiple rack creations with sequential undo", () => {
      const store = getLayoutStore();
      const initialRackCount = store.racks.length;
      store.clearHistory();

      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const rack3 = store.addRack("Rack 3", 42);

      expect(store.racks.length).toBe(initialRackCount + 3);

      store.undo(); // Undo rack3
      expect(store.racks.length).toBe(initialRackCount + 2);
      expect(store.getRackById(rack3!.id)).toBeUndefined();

      store.undo(); // Undo rack2
      expect(store.racks.length).toBe(initialRackCount + 1);
      expect(store.getRackById(rack2!.id)).toBeUndefined();

      store.undo(); // Undo rack1
      expect(store.racks.length).toBe(initialRackCount);
      expect(store.getRackById(rack1!.id)).toBeUndefined();
    });
  });

  describe("deleteRack undo/redo", () => {
    it("undoes rack deletion", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const countAfterAdd = store.racks.length;
      store.clearHistory();

      store.deleteRack(rack!.id);
      expect(store.racks.length).toBe(countAfterAdd - 1);
      expect(store.getRackById(rack!.id)).toBeUndefined();

      store.undo();

      expect(store.racks.length).toBe(countAfterAdd);
      expect(store.getRackById(rack!.id)).toBeDefined();
      expect(store.getRackById(rack!.id)!.name).toBe("Test Rack");
    });

    it("redoes rack deletion after undo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const countAfterAdd = store.racks.length;
      store.clearHistory();

      store.deleteRack(rack!.id);
      store.undo();
      expect(store.racks.length).toBe(countAfterAdd);

      store.redo();

      expect(store.racks.length).toBe(countAfterAdd - 1);
      expect(store.getRackById(rack!.id)).toBeUndefined();
    });

    it("preserves rack properties on undo delete", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Custom Rack", 24, 19, "wall-mount", true, 1);
      store.clearHistory();

      store.deleteRack(rack!.id);
      store.undo();

      const restored = store.getRackById(rack!.id);
      expect(restored).toBeDefined();
      expect(restored!.name).toBe("Custom Rack");
      expect(restored!.height).toBe(24);
      expect(restored!.form_factor).toBe("wall-mount");
    });
  });

  describe("deleteRack with group membership restoration", () => {
    it("restores group membership when undoing rack deletion", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);

      // Create a group with both racks
      const { group } = store.createRackGroup("Test Group", [
        rack1!.id,
        rack2!.id,
      ]);
      store.clearHistory();

      // Delete rack1
      store.deleteRack(rack1!.id);

      // Group should now only contain rack2
      const updatedGroup = store.getRackGroupById(group!.id);
      expect(updatedGroup).toBeDefined();
      expect(updatedGroup!.rack_ids).not.toContain(rack1!.id);
      expect(updatedGroup!.rack_ids).toContain(rack2!.id);

      // Undo deletion
      store.undo();

      // Group should be restored with both racks
      const restoredGroup = store.getRackGroupById(group!.id);
      expect(restoredGroup).toBeDefined();
      expect(restoredGroup!.rack_ids).toContain(rack1!.id);
      expect(restoredGroup!.rack_ids).toContain(rack2!.id);
    });

    it("recreates group when undoing deletion of last rack in group", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Solo Rack", 42);

      // Create a group with single rack
      const { group } = store.createRackGroup("Solo Group", [rack!.id]);
      const groupId = group!.id;
      store.clearHistory();

      // Delete the rack (should also delete the group)
      store.deleteRack(rack!.id);
      expect(store.getRackGroupById(groupId)).toBeUndefined();

      // Undo deletion
      store.undo();

      // Both rack and group should be restored
      expect(store.getRackById(rack!.id)).toBeDefined();
      const restoredGroup = store.getRackGroupById(groupId);
      expect(restoredGroup).toBeDefined();
      expect(restoredGroup!.rack_ids).toContain(rack!.id);
    });

    it("handles deletion of rack in multiple-rack group correctly", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 20);
      const rack2 = store.addRack("Rack 2", 20);
      const rack3 = store.addRack("Rack 3", 20);

      const { group } = store.createRackGroup(
        "Bayed Group",
        [rack1!.id, rack2!.id, rack3!.id],
        "bayed",
      );
      store.clearHistory();

      // Delete middle rack
      store.deleteRack(rack2!.id);

      // Verify group still exists with remaining racks
      const afterDelete = store.getRackGroupById(group!.id);
      expect(afterDelete!.rack_ids).toEqual([rack1!.id, rack3!.id]);

      // Undo and verify full restoration
      store.undo();

      const afterUndo = store.getRackGroupById(group!.id);
      expect(afterUndo!.rack_ids).toContain(rack1!.id);
      expect(afterUndo!.rack_ids).toContain(rack2!.id);
      expect(afterUndo!.rack_ids).toContain(rack3!.id);
    });
  });

  describe("rack-targeted undo binding (#2126)", () => {
    it("undoes a rack update on the original rack after switching active rack", () => {
      const store = getLayoutStore();
      const rackA = store.addRack("Rack A", 42)!;
      const rackB = store.addRack("Rack B", 42)!;
      store.setActiveRack(rackA.id);
      store.clearHistory();

      store.updateRackRecorded(rackA.id, { name: "Rack A Renamed" });
      expect(store.getRackById(rackA.id)!.name).toBe("Rack A Renamed");

      // Switch to another rack, then undo
      store.setActiveRack(rackB.id);
      store.undo();

      // The original rack reverts; the other rack is untouched
      expect(store.getRackById(rackA.id)!.name).toBe("Rack A");
      expect(store.getRackById(rackB.id)!.name).toBe("Rack B");

      // Redo also targets the original rack regardless of active rack
      store.redo();
      expect(store.getRackById(rackA.id)!.name).toBe("Rack A Renamed");
      expect(store.getRackById(rackB.id)!.name).toBe("Rack B");
    });

    it("undoes a rack clear into the original rack after switching active rack", () => {
      const store = getLayoutStore();
      const rackA = store.addRack("Rack A", 42)!;
      const rackB = store.addRack("Rack B", 42)!;
      store.addDeviceTypeRaw(
        createTestDeviceType({ slug: "test-server", u_height: 1 }),
      );
      expect(store.placeDevice(rackA.id, "test-server", 5)).toBe(true);
      expect(
        store
          .getRackById(rackA.id)!
          .devices.some((d) => d.device_type === "test-server"),
      ).toBe(true);
      store.clearHistory();

      store.clearRackRecorded(rackA.id);
      expect(
        store
          .getRackById(rackA.id)!
          .devices.some((d) => d.device_type === "test-server"),
      ).toBe(false);

      // Switch to another rack, then undo
      store.setActiveRack(rackB.id);
      store.undo();

      // Devices restore into the original rack, not the active one
      expect(
        store
          .getRackById(rackA.id)!
          .devices.some((d) => d.device_type === "test-server"),
      ).toBe(true);
      expect(store.getRackById(rackB.id)!.devices.length).toBe(0);
    });

    it("no-ops undo when the bound rack no longer exists", () => {
      const rackA = createTestRack({ id: "rack-a", name: "Rack A" });
      const rackB = createTestRack({ id: "rack-b", name: "Rack B" });
      let layout = createTestLayout({ racks: [rackA, rackB] });
      let activeRackId: string | null = "rack-b";
      const ctx: LayoutStateAccess = {
        getLayout: () => layout,
        setLayout: (l) => {
          layout = l;
        },
        getActiveRackId: () => activeRackId,
        setActiveRackId: (id) => {
          activeRackId = id;
        },
        markDirty: () => {},
        markStarted: () => {},
        getRackGroups: () => layout.rack_groups ?? [],
        findRack: (id) => layout.racks.find((r) => r.id === id),
        findRackIndex: (id) => layout.racks.findIndex((r) => r.id === id),
        getHistory: () => getHistoryStore(),
      };

      updateRackRecorded(ctx, "rack-a", { name: "Rack A Renamed" });
      expect(layout.racks.find((r) => r.id === "rack-a")!.name).toBe(
        "Rack A Renamed",
      );

      // Remove the bound rack outside the history system, then undo.
      // Without an existence guard the raw mutators fall back to the
      // first rack and would rename rack B to "Rack A".
      layout = {
        ...layout,
        racks: layout.racks.filter((r) => r.id !== "rack-a"),
      };
      getHistoryStore().undo();

      expect(layout.racks.find((r) => r.id === "rack-b")!.name).toBe("Rack B");
      expect(activeRackId).toBe("rack-b");
    });

    it("keeps the active rack unchanged across batch update execute and undo", () => {
      const store = getLayoutStore();
      const result = store.addBayedRackGroup("Bay Group", 2, 42)!;
      const [bay1] = result.racks;
      store.setActiveRack(bay1.id);
      store.clearHistory();

      // desc_units on a bayed group member fans out to a batch update
      store.updateRack(bay1.id, { desc_units: true });
      expect(store.activeRackId).toBe(bay1.id);

      store.undo();
      expect(store.activeRackId).toBe(bay1.id);

      store.redo();
      expect(store.activeRackId).toBe(bay1.id);
    });
  });

  describe("undo/redo state consistency", () => {
    it("marks layout as dirty after undo", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);
      store.markClean();

      store.undo();

      expect(store.isDirty).toBe(true);
    });

    it("marks layout as dirty after redo", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);
      store.undo();
      store.markClean();

      store.redo();

      expect(store.isDirty).toBe(true);
    });

    it("handles interleaved add/delete/undo operations", () => {
      const store = getLayoutStore();
      const initialRackCount = store.racks.length;
      store.clearHistory();

      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      store.deleteRack(rack1!.id);
      const rack3 = store.addRack("Rack 3", 42);

      // Current state: initial racks + rack2 + rack3 (rack1 was deleted)
      expect(store.racks.length).toBe(initialRackCount + 2);

      store.undo(); // Undo add rack3
      expect(store.racks.length).toBe(initialRackCount + 1);
      expect(store.getRackById(rack2!.id)).toBeDefined();

      store.undo(); // Undo delete rack1
      expect(store.racks.length).toBe(initialRackCount + 2);
      expect(store.getRackById(rack1!.id)).toBeDefined();

      store.redo(); // Redo delete rack1
      expect(store.racks.length).toBe(initialRackCount + 1);
      expect(store.getRackById(rack1!.id)).toBeUndefined();

      store.redo(); // Redo add rack3
      expect(store.racks.length).toBe(initialRackCount + 2);
      expect(store.getRackById(rack3!.id)).toBeDefined();
    });
  });
});
