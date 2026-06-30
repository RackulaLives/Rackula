/**
 * Remove-rack-from-bay Tests (#2741)
 *
 * Covers removing a rack from a bayed group: the rack is deleted, dropped from
 * the group, the row closes the gap (positions reindex), a bay that drops to a
 * single member dissolves to a standalone rack, and the whole step undoes as
 * one. Also covers the confirm-gating seam in handleRackContextDelete, where an
 * empty member removes immediately and a member holding gear confirms first.
 * Behaviour-only: no DOM queries.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { handleRackContextDelete } from "$lib/utils/rack-actions";
import { organizeRackRow } from "$lib/utils/rack-row";
import { createTestDeviceType } from "./factories";

function rowIds(store: ReturnType<typeof getLayoutStore>): string[] {
  return organizeRackRow(store.racks, store.rack_groups).flatMap((item) =>
    item.kind === "rack" ? [item.rack.id] : item.racks.map((r) => r.id),
  );
}

function sortedPositions(store: ReturnType<typeof getLayoutStore>): number[] {
  return store.racks.map((r) => r.position).sort((a, b) => a - b);
}

describe("removeRackFromBay", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("deletes the member, drops it from the group, and closes the row", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const [b1, b2, b3] = group.rack_ids;
    store.clearHistory();

    const res = store.removeRackFromBay(b2!);
    expect(res.error).toBeUndefined();

    expect(store.getRackById(b2!)).toBeUndefined();
    expect(store.getRackGroupById(group.id)!.rack_ids).toEqual([b1, b3]);
    expect(rowIds(store)).toEqual([b1, b3]);
    expect(sortedPositions(store)).toEqual([0, 1]);
  });

  it("dissolves the bay to a standalone rack when one member remains", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 2, 42, 19)!;
    const [b1, b2] = group.rack_ids;
    store.clearHistory();

    store.removeRackFromBay(b2!);

    expect(store.getRackById(b2!)).toBeUndefined();
    // The group is dissolved entirely: never a one-member bay.
    expect(store.getRackGroupById(group.id)).toBeUndefined();
    expect(store.getRackGroupForRack(b1!)).toBeUndefined();
    // The lone survivor stays as a standalone rack in the row.
    expect(store.getRackById(b1!)).toBeDefined();
    expect(rowIds(store)).toEqual([b1]);
  });

  it("reindexes so there is no gap when a mid-row member is removed", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const [b1, b2, b3] = group.rack_ids;
    const d = store.addRack("D", 42)!;
    store.clearHistory();

    store.removeRackFromBay(b1!);

    // Survivors reindex to a contiguous 0..n-1 with no empty slot.
    expect(sortedPositions(store)).toEqual([0, 1, 2]);
    expect(new Set(store.racks.map((r) => r.position)).size).toBe(
      store.racks.length,
    );
    expect(rowIds(store)).toEqual([b2, b3, d.id]);
  });

  it("removes a member that holds gear (the store deletes unconditionally)", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const [, b2] = group.rack_ids;
    const dt = createTestDeviceType({ slug: "srv", u_height: 1 });
    store.addDeviceTypeRaw(dt);
    store.placeDevice(b2!, dt.slug, 5);
    expect(store.getRackById(b2!)!.devices.length).toBeGreaterThan(0);
    store.clearHistory();

    const res = store.removeRackFromBay(b2!);
    expect(res.error).toBeUndefined();
    expect(store.getRackById(b2!)).toBeUndefined();
  });

  it("errors and leaves the rack untouched when it is standalone", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;

    const res = store.removeRackFromBay(a.id);

    expect(res.error).toBeDefined();
    expect(store.getRackById(a.id)).toBeDefined();
  });

  it("errors when the rack is in a row (non-bayed) group", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;
    const b = store.addRack("B", 42)!;
    const { group } = store.createRackGroup("Row", [a.id, b.id], "row");

    const res = store.removeRackFromBay(a.id);

    expect(res.error).toBeDefined();
    expect(store.getRackById(a.id)).toBeDefined();
    expect(store.getRackGroupById(group!.id)!.rack_ids).toEqual([a.id, b.id]);
  });

  it("undo restores the rack, its group membership, and the row positions", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const [b1, b2, b3] = group.rack_ids;
    store.addRack("D", 42);
    store.clearHistory();

    const beforeIds = rowIds(store);
    const beforePositions = new Map(store.racks.map((r) => [r.id, r.position]));

    store.removeRackFromBay(b2!);
    expect(store.getRackById(b2!)).toBeUndefined();

    store.undo();

    expect(store.getRackById(b2!)).toBeDefined();
    expect(store.getRackGroupById(group.id)!.rack_ids).toEqual([b1, b2, b3]);
    expect(rowIds(store)).toEqual(beforeIds);
    for (const rack of store.racks) {
      expect(rack.position).toBe(beforePositions.get(rack.id));
    }
  });

  it("undo restores a dissolved bay with both members", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 2, 42, 19)!;
    const [b1, b2] = group.rack_ids;
    store.clearHistory();

    store.removeRackFromBay(b2!);
    expect(store.getRackGroupById(group.id)).toBeUndefined();

    store.undo();

    const restored = store.getRackGroupById(group.id);
    expect(restored).toBeDefined();
    expect(restored!.rack_ids).toEqual([b1, b2]);
    expect(restored!.layout_preset).toBe("bayed");
    expect(store.getRackById(b2!)).toBeDefined();
  });
});

describe("handleRackContextDelete bay-member gating", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    dialogStore.close();
    dialogStore.closeSheet();
  });

  it("removes an empty bay member immediately without a confirm dialog", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const [, b2] = group.rack_ids;

    handleRackContextDelete(b2!);

    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    expect(store.getRackById(b2!)).toBeUndefined();
  });

  it("confirms before removing a bay member that holds gear", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 3, 42, 19)!;
    const [, b2] = group.rack_ids;
    const dt = createTestDeviceType({ slug: "srv", u_height: 1 });
    store.addDeviceTypeRaw(dt);
    store.placeDevice(b2!, dt.slug, 5);

    handleRackContextDelete(b2!);

    // The dialog gates the deletion: the rack is still present until confirmed.
    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
    expect(store.getRackById(b2!)).toBeDefined();
  });

  it("always confirms before deleting a standalone rack", () => {
    const store = getLayoutStore();
    const a = store.addRack("A", 42)!;

    handleRackContextDelete(a.id);

    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
    expect(store.getRackById(a.id)).toBeDefined();
  });
});
