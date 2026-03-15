/**
 * Rack Group Undo Atomicity Tests
 *
 * Tests that compound operations like addBayToGroup use BatchCommand
 * so that undo reverts both the rack addition AND the group update
 * atomically — no orphan racks left behind.
 *
 * Bug: #1475 - addBayToGroup undo leaves orphan rack
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";

describe("addBayToGroup atomic undo", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("undo removes both the new rack and the group rack_ids update", () => {
    const store = getLayoutStore();

    // Create a bayed group with 2 bays
    const result = store.addBayedRackGroup("Test Bay", 2, 42, 19);
    expect(result).not.toBeNull();
    const groupId = result!.group.id;
    const initialRackIds = [...result!.group.rack_ids];

    // Snapshot state before adding a bay
    const racksBeforeAdd = store.racks.length;
    store.clearHistory();

    // Add a bay — this should create a BatchCommand
    const addResult = store.addBayToGroup(groupId);
    expect(addResult.error).toBeUndefined();
    expect(addResult.rackId).toBeDefined();

    const newRackId = addResult.rackId!;

    // Verify the bay was added
    const groupAfterAdd = store.getRackGroupById(groupId);
    expect(groupAfterAdd!.rack_ids).toContain(newRackId);
    expect(store.racks.length).toBe(racksBeforeAdd + 1);

    // Undo — should atomically remove the rack AND revert group rack_ids
    store.undo();

    // The rack should be gone
    expect(store.getRackById(newRackId)).toBeUndefined();
    expect(store.racks.length).toBe(racksBeforeAdd);

    // The group's rack_ids should be restored to the original
    const groupAfterUndo = store.getRackGroupById(groupId);
    expect(groupAfterUndo).toBeDefined();
    expect(groupAfterUndo!.rack_ids).toEqual(initialRackIds);
    expect(groupAfterUndo!.rack_ids).not.toContain(newRackId);
  });

  it("redo re-applies both rack addition and group update", () => {
    const store = getLayoutStore();

    const result = store.addBayedRackGroup("Redo Bay", 2, 42, 19);
    expect(result).not.toBeNull();
    const groupId = result!.group.id;
    store.clearHistory();

    // Add bay, then undo, then redo
    const addResult = store.addBayToGroup(groupId);
    const newRackId = addResult.rackId!;

    store.undo();
    expect(store.getRackById(newRackId)).toBeUndefined();

    store.redo();

    // Both rack and group membership should be restored
    expect(store.getRackById(newRackId)).toBeDefined();
    const groupAfterRedo = store.getRackGroupById(groupId);
    expect(groupAfterRedo!.rack_ids).toContain(newRackId);
  });
});
