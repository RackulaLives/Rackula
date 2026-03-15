/**
 * Rack Group Store Tests
 *
 * Tests for rack group CRUD operations in the layout store.
 * Groups allow organizing racks with shared layout presets (bayed, row).
 *
 * Issue: #476 - Rack Group Management & Layout Presets
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";

describe("Rack Group Store", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("createRackGroup", () => {
    it("creates a group with given name and rack IDs", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);

      const result = store.createRackGroup("Touring Bay", [
        rack1!.id,
        rack2!.id,
      ]);

      expect(result.group).toBeDefined();
      expect(result.group!.name).toBe("Touring Bay");
      expect(result.group!.rack_ids).toContain(rack1!.id);
      expect(result.group!.rack_ids).toContain(rack2!.id);
    });

    it("generates unique ID for the group", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);

      const result1 = store.createRackGroup("Group 1", [rack1!.id]);
      const result2 = store.createRackGroup("Group 2", [rack2!.id]);

      expect(result1.group!.id).toBeDefined();
      expect(result2.group!.id).toBeDefined();
      expect(result1.group!.id).not.toBe(result2.group!.id);
    });

    it("sets layout_preset to row by default", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);

      const result = store.createRackGroup("Default Group", [rack!.id]);

      expect(result.group!.layout_preset).toBe("row");
    });

    it("marks layout as dirty", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      store.markClean();

      store.createRackGroup("Test Group", [rack!.id]);

      expect(store.isDirty).toBe(true);
    });

    it("rejects empty rack_ids array", () => {
      const store = getLayoutStore();

      const result = store.createRackGroup("Empty Group", []);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("at least one rack");
      expect(result.group).toBeUndefined();
    });

    it("rejects non-existent rack IDs", () => {
      const store = getLayoutStore();

      const result = store.createRackGroup("Bad Group", ["nonexistent-rack"]);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("not found");
      expect(result.group).toBeUndefined();
    });

    it("adds group to rack_groups array", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const initialCount = store.rack_groups.length;

      store.createRackGroup("Test Group", [rack!.id]);

      expect(store.rack_groups.length).toBe(initialCount + 1);
    });

    it("rejects creating group with rack already in another group", () => {
      const store = getLayoutStore();
      store.addRack("Rack 1", 42);
      store.addRack("Rack 2", 42);
      store.addRack("Rack 3", 42);
      const rack1Id = store.racks[0]!.id;
      const rack2Id = store.racks[1]!.id;
      const rack3Id = store.racks[2]!.id;

      // Create first group
      const result1 = store.createRackGroup(
        "Group A",
        [rack1Id, rack2Id],
        "row",
      );
      expect(result1.group).toBeDefined();

      // Try to create second group with rack1 (already in Group A)
      const result2 = store.createRackGroup(
        "Group B",
        [rack1Id, rack3Id],
        "row",
      );
      expect(result2.error).toContain("already in");
      expect(result2.error).toContain("Group A");
    });
  });

  describe("createRackGroup with bayed preset", () => {
    it("creates bayed group when all racks have same height", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 20);
      const rack2 = store.addRack("Rack 2", 20);
      const rack3 = store.addRack("Rack 3", 20);

      const result = store.createRackGroup(
        "Touring Bay",
        [rack1!.id, rack2!.id, rack3!.id],
        "bayed",
      );

      expect(result.group).toBeDefined();
      expect(result.group!.layout_preset).toBe("bayed");
      expect(result.error).toBeUndefined();
    });

    it("rejects bayed group with mixed-height racks", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 20);
      const rack2 = store.addRack("Rack 2", 12); // Different height!
      const rack3 = store.addRack("Rack 3", 20);

      const result = store.createRackGroup(
        "Bad Bayed",
        [rack1!.id, rack2!.id, rack3!.id],
        "bayed",
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain("same-height");
      expect(result.error).toContain("12U"); // Should mention the mismatched heights
      expect(result.error).toContain("20U");
      expect(result.group).toBeUndefined();
    });

    it("rejects single-rack bayed group", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Solo Rack", 20);

      const result = store.createRackGroup("Solo Bay", [rack!.id], "bayed");

      expect(result.error).toBeDefined();
      expect(result.error).toContain("at least 2 racks");
      expect(result.group).toBeUndefined();
    });
  });

  describe("getRackGroupById", () => {
    it("returns group by ID", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);

      const found = store.getRackGroupById(group!.id);

      expect(found).toBeDefined();
      expect(found!.name).toBe("Test Group");
    });

    it("returns undefined for non-existent ID", () => {
      const store = getLayoutStore();

      const found = store.getRackGroupById("nonexistent-id");

      expect(found).toBeUndefined();
    });
  });

  describe("getRackGroupForRack", () => {
    it("returns group containing the rack", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [
        rack1!.id,
        rack2!.id,
      ]);

      const found = store.getRackGroupForRack(rack1!.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(group!.id);
    });

    it("returns undefined if rack not in any group", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Ungrouped Rack", 42);

      const found = store.getRackGroupForRack(rack!.id);

      expect(found).toBeUndefined();
    });
  });

  describe("updateRackGroup", () => {
    it("updates group name", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Original Name", [rack!.id]);

      store.updateRackGroup(group!.id, { name: "Updated Name" });

      const updated = store.getRackGroupById(group!.id);
      expect(updated!.name).toBe("Updated Name");
    });

    it("updates layout_preset", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [rack1!.id, rack2!.id], "row");

      store.updateRackGroup(group!.id, { layout_preset: "bayed" });

      const updated = store.getRackGroupById(group!.id);
      expect(updated!.layout_preset).toBe("bayed");
    });

    it("validates bayed preset requires same-height racks", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 20);
      const rack2 = store.addRack("Rack 2", 12);
      const { group } = store.createRackGroup(
        "Mixed Group",
        [rack1!.id, rack2!.id],
        "row",
      );

      const result = store.updateRackGroup(group!.id, {
        layout_preset: "bayed",
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("same-height");
      // Preset should remain unchanged
      const unchanged = store.getRackGroupById(group!.id);
      expect(unchanged!.layout_preset).toBe("row");
    });

    it("marks layout as dirty", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);
      store.markClean();

      store.updateRackGroup(group!.id, { name: "Updated" });

      expect(store.isDirty).toBe(true);
    });
  });

  describe("addRackToGroup", () => {
    it("adds rack to existing group", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [rack1!.id]);

      const result = store.addRackToGroup(group!.id, rack2!.id);

      expect(result.error).toBeUndefined();
      const updated = store.getRackGroupById(group!.id);
      expect(updated!.rack_ids).toContain(rack2!.id);
    });

    it("validates bayed group height requirement", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 20);
      const rack1b = store.addRack("Rack 1b", 20); // Same height for valid bayed group
      const rack2 = store.addRack("Rack 2", 12); // Different height
      const { group } = store.createRackGroup(
        "Bayed Group",
        [rack1!.id, rack1b!.id],
        "bayed",
      );

      const result = store.addRackToGroup(group!.id, rack2!.id);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("12U");
      expect(result.error).toContain("20U");
    });

    it("rejects adding rack already in group", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);

      const result = store.addRackToGroup(group!.id, rack!.id);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("already");
    });

    it("rejects non-existent rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);

      const result = store.addRackToGroup(group!.id, "nonexistent-rack");

      expect(result.error).toBeDefined();
      expect(result.error).toContain("not found");
    });

    it("marks layout as dirty", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [rack1!.id]);
      store.markClean();

      store.addRackToGroup(group!.id, rack2!.id);

      expect(store.isDirty).toBe(true);
    });

    it("rejects adding rack already in another group", () => {
      const store = getLayoutStore();
      store.addRack("Rack 1", 42);
      store.addRack("Rack 2", 42);
      store.addRack("Rack 3", 42);
      const rack1Id = store.racks[0]!.id;
      const rack2Id = store.racks[1]!.id;

      // Create two groups
      store.createRackGroup("Group A", [rack1Id], "row");
      const result2 = store.createRackGroup("Group B", [rack2Id], "row");
      const groupBId = result2.group!.id;

      // Try to add rack1 (in Group A) to Group B
      const addResult = store.addRackToGroup(groupBId, rack1Id);
      expect(addResult.error).toContain("already in");
      expect(addResult.error).toContain("Group A");
    });
  });

  describe("removeRackFromGroup", () => {
    it("removes rack from group", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [
        rack1!.id,
        rack2!.id,
      ]);

      store.removeRackFromGroup(group!.id, rack1!.id);

      const updated = store.getRackGroupById(group!.id);
      expect(updated!.rack_ids).not.toContain(rack1!.id);
      expect(updated!.rack_ids).toContain(rack2!.id);
    });

    it("deletes group when last rack removed", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);

      store.removeRackFromGroup(group!.id, rack!.id);

      const deleted = store.getRackGroupById(group!.id);
      expect(deleted).toBeUndefined();
    });

    it("marks layout as dirty", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [
        rack1!.id,
        rack2!.id,
      ]);
      store.markClean();

      store.removeRackFromGroup(group!.id, rack1!.id);

      expect(store.isDirty).toBe(true);
    });
  });

  describe("deleteRackGroup", () => {
    it("removes group from layout", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);
      const initialCount = store.rack_groups.length;

      store.deleteRackGroup(group!.id);

      expect(store.rack_groups.length).toBe(initialCount - 1);
      expect(store.getRackGroupById(group!.id)).toBeUndefined();
    });

    it("does not affect the racks themselves", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);

      store.deleteRackGroup(group!.id);

      // Rack should still exist
      expect(store.getRackById(rack!.id)).toBeDefined();
    });

    it("marks layout as dirty", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);
      store.markClean();

      store.deleteRackGroup(group!.id);

      expect(store.isDirty).toBe(true);
    });
  });

  describe("updateRack with bayed groups", () => {
    it("rejects height changes for racks in bayed groups", () => {
      const store = getLayoutStore();
      // Create bayed rack (same heights required)
      const result = store.addBayedRackGroup("Touring Bay", 2, 20, 19);
      expect(result).not.toBeNull();
      const rack1Id = result!.racks[0]!.id;

      // Try to change height
      store.updateRack(rack1Id, { height: 12 });

      // Height should be unchanged (still 20)
      expect(store.getRackById(rack1Id)?.height).toBe(20);
    });
  });

  describe("deleteRack removes rack from groups", () => {
    it("removes deleted rack from its group", () => {
      const store = getLayoutStore();
      const rack1 = store.addRack("Rack 1", 42);
      const rack2 = store.addRack("Rack 2", 42);
      const { group } = store.createRackGroup("Test Group", [
        rack1!.id,
        rack2!.id,
      ]);

      store.deleteRack(rack1!.id);

      const updated = store.getRackGroupById(group!.id);
      expect(updated!.rack_ids).not.toContain(rack1!.id);
      expect(updated!.rack_ids).toContain(rack2!.id);
    });

    it("deletes group when last rack is deleted", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Solo Group", [rack!.id]);

      store.deleteRack(rack!.id);

      expect(store.getRackGroupById(group!.id)).toBeUndefined();
    });
  });

  describe("undo/redo support", () => {
    it("undoes createRackGroup", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      store.clearHistory();

      const { group } = store.createRackGroup("Test Group", [rack!.id]);
      expect(store.getRackGroupById(group!.id)).toBeDefined();

      store.undo();

      expect(store.getRackGroupById(group!.id)).toBeUndefined();
    });

    it("undoes deleteRackGroup", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Test Group", [rack!.id]);
      store.clearHistory();

      store.deleteRackGroup(group!.id);
      expect(store.getRackGroupById(group!.id)).toBeUndefined();

      store.undo();

      const restored = store.getRackGroupById(group!.id);
      expect(restored).toBeDefined();
      expect(restored!.name).toBe("Test Group");
    });

    it("undoes updateRackGroup", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      const { group } = store.createRackGroup("Original Name", [rack!.id]);
      store.clearHistory();

      store.updateRackGroup(group!.id, { name: "Updated Name" });
      expect(store.getRackGroupById(group!.id)!.name).toBe("Updated Name");

      store.undo();

      expect(store.getRackGroupById(group!.id)!.name).toBe("Original Name");
    });

    it("redoes createRackGroup after undo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Rack 1", 42);
      store.clearHistory();

      const { group } = store.createRackGroup("Test Group", [rack!.id]);
      const groupId = group!.id;

      store.undo();
      expect(store.getRackGroupById(groupId)).toBeUndefined();

      store.redo();
      expect(store.getRackGroupById(groupId)).toBeDefined();
    });
  });
});
