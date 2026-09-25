import type { Rack, RackGroup } from "$lib/types";

/**
 * A single slot on the canvas: either a standalone rack or a group of racks
 * (bayed or row preset) whose members render contiguously.
 */
export type RackRowItem =
  | { kind: "rack"; rack: Rack }
  | { kind: "group"; group: RackGroup; racks: Rack[] };

/**
 * Order racks and groups into canvas slots by Rack.position.
 *
 * Standalone racks (members of no group) are individual slots. A group's
 * members stay together in one slot, and the group sorts at its lowest-position
 * member. Members are in position order. Groups with no resolvable member are
 * dropped. A rack listed in more than one group is claimed by the first group
 * only, and a rack id repeated within one group is included once. Equal
 * positions keep insertion order (groups first, then racks).
 */
function organizeSlots(racks: Rack[], groups: RackGroup[]): RackRowItem[] {
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
 * Lay racks out as rows stacked top to bottom (#3370).
 *
 * Each group (bayed or row preset) is a row of its own, and all standalone
 * racks share one row, left to right by position. Rows are ordered by their
 * lowest-position slot. Grouping and member order follow organizeSlots.
 */
export function organizeRackRows(
  racks: Rack[],
  groups: RackGroup[],
): RackRowItem[][] {
  const rows: RackRowItem[][] = [];
  let standalone: RackRowItem[] | null = null;
  for (const item of organizeSlots(racks, groups)) {
    if (item.kind === "group") {
      rows.push([item]);
    } else if (standalone === null) {
      standalone = [item];
      rows.push(standalone);
    } else {
      standalone.push(item);
    }
  }
  return rows;
}

/**
 * Every canvas slot in reading order: the rows from organizeRackRows, top to
 * bottom, each left to right. Reindexing Rack.position in this order keeps
 * every row and the row order unchanged.
 */
export function organizeRackRow(
  racks: Rack[],
  groups: RackGroup[],
): RackRowItem[] {
  return organizeRackRows(racks, groups).flat();
}

/** Rack ids of a slot, in render order. */
function slotRackIds(item: RackRowItem): string[] {
  return item.kind === "rack" ? [item.rack.id] : item.racks.map((r) => r.id);
}

/**
 * Find the slot holding rackId and the sequence it reorders within. A
 * standalone rack moves along the standalone row; a group fills its own row,
 * so it moves among the rows. `index` is the slot's place in that sequence and
 * `length` is the sequence length.
 */
function locateSlot(
  rows: RackRowItem[][],
  rackId: string,
): {
  item: RackRowItem;
  rowIndex: number;
  movesRow: boolean;
  index: number;
  length: number;
} | null {
  for (const [rowIndex, row] of rows.entries()) {
    const itemIndex = row.findIndex((item) =>
      slotRackIds(item).includes(rackId),
    );
    const item = row[itemIndex];
    if (item === undefined) continue;
    const movesRow = item.kind === "group";
    return {
      item,
      rowIndex,
      movesRow,
      index: movesRow ? rowIndex : itemIndex,
      length: movesRow ? rows.length : row.length,
    };
  }
  return null;
}

function swap<T>(list: T[], from: number, to: number): void {
  const moved = list[from]!;
  list[from] = list[to]!;
  list[to] = moved;
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
 * Reorder availability and bay source for the slot containing selectedRackId
 * (a standalone rack, or a group's active member). A standalone rack reorders
 * within the standalone row and a group reorders among the rows (see
 * locateSlot). Chevrons show only when that sequence has two or more entries
 * and disable at the ends. Baying follows baySourceForItem. Returns the empty
 * state when nothing reorderable is selected.
 */
export function getRackSlotControls(
  racks: Rack[],
  groups: RackGroup[],
  selectedRackId: string | null,
  activeRackId: string | null,
): RackSlotControls {
  const slot =
    selectedRackId === null
      ? null
      : locateSlot(organizeRackRows(racks, groups), selectedRackId);
  const canReorder = slot !== null && slot.length >= 2;
  return {
    canReorder,
    canMoveLeft: canReorder && slot.index > 0,
    canMoveRight: canReorder && slot.index < slot.length - 1,
    baySource: baySourceForItem(slot?.item, activeRackId),
  };
}

/** A new Rack.position for a rack, in its new row order. */
export type RackPositionAssignment = { id: string; position: number };

/**
 * Compute the Rack.position values that move the slot containing
 * `selectedRackId` one place left or right, swapping it with its neighbour.
 *
 * A standalone rack swaps with its neighbour in the standalone row. A group
 * fills its own row, so a grouped rack moves its whole group one row earlier
 * ("left") or later ("right") and is never pulled out of its group. Every rack
 * is then reindexed to sequential positions in reading order, so positions stay
 * whole and unique and group members stay contiguous. Returns one assignment
 * per rack in the new order, or null when the move is a no-op: the rack is not
 * on the canvas, the slot is already at the target edge, or there is nothing
 * to swap with.
 */
export function reorderRackRow(
  racks: Rack[],
  groups: RackGroup[],
  selectedRackId: string,
  direction: "left" | "right",
): RackPositionAssignment[] | null {
  const rows = organizeRackRows(racks, groups);
  const slot = locateSlot(rows, selectedRackId);
  if (slot === null) return null;

  const toIndex = direction === "left" ? slot.index - 1 : slot.index + 1;
  if (toIndex < 0 || toIndex >= slot.length) return null;

  if (slot.movesRow) swap(rows, slot.index, toIndex);
  else swap(rows[slot.rowIndex]!, slot.index, toIndex);

  return rows
    .flat()
    .flatMap(slotRackIds)
    .map((id, position) => ({ id, position }));
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
 * `removedRackIds` are taken out of it. A single rack removal (bay-member
 * removal, standalone delete) passes a one-element array; a whole-group
 * delete passes every member at once so the row compacts in one step instead
 * of leaving a gap that a sequence of single removals would have closed. The
 * removed racks are dropped from the row and from any group, and the
 * remaining racks are reindexed to sequential positions so no empty slot is
 * left where they were. A group that loses every resolvable member
 * contributes nothing, so a lone survivor (if any) simply reindexes as a
 * standalone slot.
 *
 * Returns one assignment per remaining rack in row order, or null when none
 * of `removedRackIds` are in `racks`.
 */
export function planRowAfterRemoval(
  racks: Rack[],
  groups: RackGroup[],
  removedRackIds: string[],
): RackPositionAssignment[] | null {
  const removedSet = new Set(removedRackIds);
  if (!racks.some((rack) => removedSet.has(rack.id))) return null;

  const remainingRacks = racks.filter((rack) => !removedSet.has(rack.id));
  const remainingGroups = groups.map((group) => ({
    ...group,
    rack_ids: group.rack_ids.filter((id) => !removedSet.has(id)),
  }));

  return organizeRackRow(remainingRacks, remainingGroups)
    .flatMap((item) =>
      item.kind === "rack" ? [item.rack.id] : item.racks.map((r) => r.id),
    )
    .map((id, position) => ({ id, position }));
}
