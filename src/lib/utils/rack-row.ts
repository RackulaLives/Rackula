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
