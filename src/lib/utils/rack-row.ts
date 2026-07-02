import type { Rack, RackGroup } from "$lib/types";

/**
 * A single slot in the canvas row: either a standalone rack or a group of
 * racks (bayed or row preset) whose members render contiguously.
 */
export type RackRowItem =
  | { kind: "rack"; rack: Rack }
  | { kind: "group"; group: RackGroup; racks: Rack[] };

/**
 * Lay racks out as one horizontal row ordered by Rack.position.
 *
 * Standalone racks (members of no group) are individual row items. A group's
 * members render contiguously, and the group takes the row slot of its
 * lowest-position member, so bayed racks stay flush and never interleave with
 * unrelated racks. Members render in position order. Groups with no resolvable
 * member are dropped. A rack listed in more than one group is claimed by the
 * first group only, and a rack id repeated within one group is included once.
 */
export function organizeRackRow(
  racks: Rack[],
  groups: RackGroup[],
): RackRowItem[] {
  const rackById = new Map(racks.map((rack) => [rack.id, rack]));
  const claimed = new Set<string>();

  type Slot = { sortKey: number; seq: number; item: RackRowItem };
  const slots: Slot[] = [];
  let seq = 0;

  for (const group of groups) {
    const seen = new Set<string>();
    const members: Rack[] = [];
    for (const id of group.rack_ids) {
      if (seen.has(id) || claimed.has(id)) continue;
      const rack = rackById.get(id);
      if (rack === undefined) continue;
      seen.add(id);
      members.push(rack);
    }
    members.sort((a, b) => a.position - b.position);
    const first = members[0];
    if (first === undefined) continue;
    for (const rack of members) claimed.add(rack.id);
    slots.push({
      sortKey: first.position,
      seq: seq++,
      item: { kind: "group", group, racks: members },
    });
  }

  for (const rack of racks) {
    if (claimed.has(rack.id)) continue;
    slots.push({
      sortKey: rack.position,
      seq: seq++,
      item: { kind: "rack", rack },
    });
  }

  slots.sort((a, b) => a.sortKey - b.sortKey || a.seq - b.seq);
  return slots.map((slot) => slot.item);
}

/**
 * The rack to bay from for a row item, or null when baying is not offered.
 *
 * Baying is a creation-time affordance (design 2026-07-01): it appears only on
 * an empty standalone rack, which bays from itself, and on a bayed group, which
 * extends from its active member whatever the members contain. A populated
 * standalone rack and a non-bayed group return null. The active member is the
 * one matching activeRackId, or the group's first member when activeRackId is
 * not part of the group. Does not consult the bayed-racks setting; the caller
 * ANDs that in. Shared by the verb bar and the edge grip (#2823) so both gate
 * baying identically.
 */
export function baySourceForItem(
  item: RackRowItem | undefined,
  activeRackId: string | null,
): string | null {
  if (!item) return null;
  if (item.kind === "rack") {
    return item.rack.devices.length === 0 ? item.rack.id : null;
  }
  if (item.group.layout_preset !== "bayed") return null;
  const active =
    activeRackId !== null && item.racks.some((rack) => rack.id === activeRackId)
      ? activeRackId
      : item.racks[0]?.id;
  return active ?? null;
}

/** Reorder and bay controls for the row slot holding a selected rack or group. */
export interface RackSlotControls {
  /** The row has two or more slots, so the reorder chevrons should show. */
  canReorder: boolean;
  /** The slot can move left (it is not the first slot). */
  canMoveLeft: boolean;
  /** The slot can move right (it is not the last slot). */
  canMoveRight: boolean;
  /** The rack to bay from, or null when baying is not offered for this slot. */
  baySource: string | null;
}

/**
 * Reorder availability and bay source for the row slot containing
 * selectedRackId (a standalone rack, or a group's active member). Chevrons show
 * only when the row has two or more slots and disable at the ends, matching the
 * retired slot-controls lane. Baying follows baySourceForItem. Returns the empty
 * state when nothing reorderable is selected.
 */
export function getRackSlotControls(
  racks: Rack[],
  groups: RackGroup[],
  selectedRackId: string | null,
  activeRackId: string | null,
): RackSlotControls {
  const items = organizeRackRow(racks, groups);
  const index =
    selectedRackId === null
      ? -1
      : items.findIndex((item) =>
          item.kind === "rack"
            ? item.rack.id === selectedRackId
            : item.racks.some((rack) => rack.id === selectedRackId),
        );
  const canReorder = index !== -1 && items.length >= 2;
  return {
    canReorder,
    canMoveLeft: canReorder && index > 0,
    canMoveRight: canReorder && index < items.length - 1,
    baySource: baySourceForItem(items[index], activeRackId),
  };
}

/** A new Rack.position for a rack, in its new row order. */
export type RackPositionAssignment = { id: string; position: number };

/**
 * Compute the Rack.position values that move the row slot containing
 * `selectedRackId` one place left or right, swapping it with its neighbour.
 *
 * A group occupies a single row slot, so a grouped rack moves its whole group
 * as a unit and is never pulled out of its group. The whole row is reindexed to
 * sequential positions in its new order, so positions stay whole and unique and
 * group members stay contiguous. Returns one assignment per rack in the new row
 * order, or null when the move is a no-op: the rack is not in the row, the slot
 * is already at the target edge, or there are fewer than two slots to reorder.
 */
export function reorderRackRow(
  racks: Rack[],
  groups: RackGroup[],
  selectedRackId: string,
  direction: "left" | "right",
): RackPositionAssignment[] | null {
  const items = organizeRackRow(racks, groups);
  if (items.length < 2) return null;

  const fromIndex = items.findIndex((item) =>
    item.kind === "rack"
      ? item.rack.id === selectedRackId
      : item.racks.some((rack) => rack.id === selectedRackId),
  );
  if (fromIndex === -1) return null;

  const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= items.length) return null;

  const reordered = [...items];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved!);

  // Flatten back to one ordered rack list (a group contributes its members in
  // order) and reindex sequentially so the new order persists in Rack.position.
  return reordered
    .flatMap((item) => (item.kind === "rack" ? [item.rack] : item.racks))
    .map((rack, position) => ({ id: rack.id, position }));
}

/**
 * Compute the Rack.position values that place `newRackId` immediately to the
 * right of `sourceRackId` in the canvas row, then reindex the whole row to
 * sequential positions. Used when baying a rack: a new bayed member is inserted
 * flush after its source, and every slot to the right is pushed along by one so
 * no positions collide and group members stay contiguous.
 *
 * `newRackId` must not already be in `racks` (it is the about-to-be-created
 * member); it is woven into the order purely to assign positions. Returns one
 * assignment per resulting rack in row order (including the new id), or null
 * when `sourceRackId` is not part of the row.
 */
export function planBayedInsert(
  racks: Rack[],
  groups: RackGroup[],
  sourceRackId: string,
  newRackId: string,
): RackPositionAssignment[] | null {
  const ordered = organizeRackRow(racks, groups).flatMap((item) =>
    item.kind === "rack" ? [item.rack.id] : item.racks.map((rack) => rack.id),
  );
  const sourceIndex = ordered.indexOf(sourceRackId);
  if (sourceIndex === -1) return null;
  ordered.splice(sourceIndex + 1, 0, newRackId);
  return ordered.map((id, position) => ({ id, position }));
}

/**
 * Compute the Rack.position values that close the canvas row after
 * `removedRackId` is taken out of it. The removed rack is dropped from the row
 * and from any group, and the remaining racks are reindexed to sequential
 * positions so no empty slot is left where the rack was. A group that loses its
 * only resolvable member contributes nothing, so its lone survivor (if any)
 * simply reindexes as a standalone slot.
 *
 * Returns one assignment per remaining rack in row order, or null when
 * `removedRackId` is not in `racks`.
 */
export function planRowAfterRemoval(
  racks: Rack[],
  groups: RackGroup[],
  removedRackId: string,
): RackPositionAssignment[] | null {
  if (!racks.some((rack) => rack.id === removedRackId)) return null;

  const remainingRacks = racks.filter((rack) => rack.id !== removedRackId);
  const remainingGroups = groups.map((group) => ({
    ...group,
    rack_ids: group.rack_ids.filter((id) => id !== removedRackId),
  }));

  return organizeRackRow(remainingRacks, remainingGroups)
    .flatMap((item) =>
      item.kind === "rack" ? [item.rack.id] : item.racks.map((r) => r.id),
    )
    .map((id, position) => ({ id, position }));
}
