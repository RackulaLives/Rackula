/**
 * deleteBayedGroup row-compaction tests (#2994 CodeRabbit follow-up)
 *
 * deleteBayedGroup batches the group deletion and every member's deletion
 * into a single BatchCommand (see rack-groups.ts), but unlike
 * removeRackFromBay it added no reindex commands to that batch. Deleting a
 * group positioned before other racks in the row left those racks' persisted
 * positions unchanged, opening a multi-rack gap. These tests cover the row
 * closing the gap and a single undo restoring both the group and the
 * positions it disturbed. Behaviour-only: no DOM queries.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { organizeRackRow } from "$lib/utils/rack-row";

function rowIds(store: ReturnType<typeof getLayoutStore>): string[] {
  return organizeRackRow(store.racks, store.rack_groups).flatMap((item) =>
    item.kind === "rack" ? [item.rack.id] : item.racks.map((r) => r.id),
  );
}

describe("deleteBayedGroup row compaction", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("closes the gap when a group positioned before other racks is deleted", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 2, 42, 19)!;
    const c = store.addRack("C", 42)!;
    const d = store.addRack("D", 42)!;
    store.clearHistory();

    const res = store.deleteBayedGroup(group.id);
    expect(res.error).toBeUndefined();

    // The racks that trailed the deleted group compact forward with no gap.
    expect(rowIds(store)).toEqual([c.id, d.id]);
    expect(store.racks.map((r) => r.position).sort((a, b) => a - b)).toEqual([
      0, 1,
    ]);
  });

  it("undo restores the group, its racks, and the trailing racks' positions together", () => {
    const store = getLayoutStore();
    const { group } = store.addBayedRackGroup("Bay", 2, 42, 19)!;
    const rackIds = [...group.rack_ids];
    const c = store.addRack("C", 42)!;
    const d = store.addRack("D", 42)!;
    store.clearHistory();

    const beforeIds = rowIds(store);
    const beforePositions = new Map(store.racks.map((r) => [r.id, r.position]));

    store.deleteBayedGroup(group.id);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.canUndo).toBe(false);

    for (const rackId of rackIds) {
      expect(store.getRackById(rackId)).toBeDefined();
    }
    const restoredGroup = store.getRackGroupById(group.id);
    expect(restoredGroup).toBeDefined();
    expect(restoredGroup!.rack_ids).toEqual(rackIds);
    expect(rowIds(store)).toEqual(beforeIds);
    for (const rack of store.racks) {
      expect(rack.position).toBe(beforePositions.get(rack.id));
    }
    expect(store.getRackById(c.id)!.position).toBe(beforePositions.get(c.id));
    expect(store.getRackById(d.id)!.position).toBe(beforePositions.get(d.id));
  });
});
