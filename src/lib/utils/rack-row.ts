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
