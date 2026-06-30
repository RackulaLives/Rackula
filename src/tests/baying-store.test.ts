/**
 * Baying Store Tests (#2740)
 *
 * Covers the create/extend/insert/uniformity/reindex logic and the bay-level
 * resize, plus undo atomicity. Behaviour-only: no DOM queries.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { organizeRackRow } from "$lib/utils/rack-row";

function rowIds(store: ReturnType<typeof getLayoutStore>): string[] {
  return organizeRackRow(store.racks, store.rack_groups).flatMap((item) =>
    item.kind === "rack" ? [item.rack.id] : item.racks.map((r) => r.id),
  );
}

describe("createBayedRack", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("forms a bayed group from a standalone rack, inheriting uniform fields", () => {
    const store = getLayoutStore();
    const source = store.addRack("Rack A", 24, 21, "open-frame", true, 5)!;

    const result = store.createBayedRack(source.id);
    expect(result.error).toBeUndefined();
    const newRack = store.getRackById(result.rackId!)!;

    // Uniform: width, form factor, height inherited from the source.
    expect(newRack.width).toBe(source.width);
    expect(newRack.form_factor).toBe(source.form_factor);
    expect(newRack.height).toBe(source.height);
    // U-numbering inherited so the shared bay column stays consistent.
    expect(newRack.desc_units).toBe(source.desc_units);
    expect(newRack.starting_unit).toBe(source.starting_unit);

    const group = store.getRackGroupById(result.groupId!)!;
    expect(group.layout_preset).toBe("bayed");
    expect(group.rack_ids).toEqual([source.id, newRack.id]);
  });

  it("extends an existing bay with a uniform member", () => {
    const store = getLayoutStore();
    const source = store.addRack("Rack A", 30, 19, "4-post-cabinet")!;
    const first = store.createBayedRack(source.id);
    const groupId = first.groupId!;

    const second = store.createBayedRack(source.id);
    expect(second.groupId).toBe(groupId);

    const group = store.getRackGroupById(groupId)!;
    // Behavioural invariant: the source is retained and the new member added.
    expect(group.rack_ids).toContain(source.id);
    expect(group.rack_ids).toContain(second.rackId);
    // Every member shares the source's height (equal-height invariant).
    for (const id of group.rack_ids) {
      expect(store.getRackById(id)!.height).toBe(30);
    }
  });

  it("inserts mid-row and pushes the racks to the right along", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;
    const b = store.addRack("B", 42)!;
    const c = store.addRack("C", 42)!;
    // Establish a deterministic left-to-right order a, b, c.
    store.moveRackInRow(a.id, "left"); // no-op at edge, but seeds positions
    expect(rowIds(store)).toEqual([a.id, b.id, c.id]);

    const result = store.createBayedRack(b.id);
    const newId = result.rackId!;

    // New rack sits flush right of b; c is pushed along; nothing overwritten.
    expect(rowIds(store)).toEqual([a.id, b.id, newId, c.id]);
    const positions = store.racks.map((r) => r.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("refuses to bay when the source is in a row (non-bayed) group", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;
    const b = store.addRack("B", 42)!;
    const { group } = store.createRackGroup("Row", [a.id, b.id], "row");

    const result = store.createBayedRack(a.id);
    expect(result.error).toBeDefined();
    expect(result.rackId).toBeUndefined();
    // The row group is untouched.
    expect(store.getRackGroupById(group!.id)!.rack_ids).toEqual([a.id, b.id]);
  });

  it("undo reverts the new rack, the group, and the reindex together", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;
    const b = store.addRack("B", 42)!;
    store.addRack("C", 42);
    store.moveRackInRow(a.id, "left");
    const beforeIds = rowIds(store);
    const beforePositions = new Map(store.racks.map((r) => [r.id, r.position]));

    const result = store.createBayedRack(b.id);
    const newId = result.rackId!;
    expect(store.getRackById(newId)).toBeDefined();

    store.undo();

    // New rack gone, no group formed, positions restored exactly.
    expect(store.getRackById(newId)).toBeUndefined();
    expect(store.getRackGroupForRack(b.id)).toBeUndefined();
    expect(rowIds(store)).toEqual(beforeIds);
    for (const rack of store.racks) {
      expect(rack.position).toBe(beforePositions.get(rack.id));
    }
  });

  it("redo re-applies the whole bay creation", () => {
    const store = getLayoutStore();
    const source = store.addRack("A", 42)!;
    const result = store.createBayedRack(source.id);
    const newId = result.rackId!;

    store.undo();
    expect(store.getRackById(newId)).toBeUndefined();

    store.redo();
    expect(store.getRackById(newId)).toBeDefined();
    const group = store.getRackGroupForRack(source.id)!;
    expect(group.rack_ids).toContain(newId);
  });
});

describe("resizeBayedGroupHeight", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("resizes every member equally and one undo reverts them all", () => {
    const store = getLayoutStore();
    const result = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const groupId = result.group.id;
    store.clearHistory();

    const res = store.resizeBayedGroupHeight(groupId, 30);
    expect(res.error).toBeUndefined();
    for (const id of result.group.rack_ids) {
      expect(store.getRackById(id)!.height).toBe(30);
    }

    store.undo();
    for (const id of result.group.rack_ids) {
      expect(store.getRackById(id)!.height).toBe(42);
    }
  });

  it("rejects resizing a non-bayed group", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;
    const b = store.addRack("B", 42)!;
    const { group } = store.createRackGroup("Row", [a.id, b.id], "row");

    const res = store.resizeBayedGroupHeight(group!.id, 30);
    expect(res.error).toBeDefined();
    expect(store.getRackById(a.id)!.height).toBe(42);
  });
});
