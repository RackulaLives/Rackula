/**
 * Container cell geometry: where each slot of a carrier or chassis sits inside
 * the container, in SVG pixels relative to the container's top-left corner.
 *
 * RackDevice computes the cells once and uses them for both the rendered
 * children and the ContainerSlots overlay, so drop highlights line up with
 * the children drawn in them. Drop targeting (slotAtPoint in dragdrop.ts)
 * and fill order (collision.ts) read the same rows and grid order (#3342).
 */
import type { Slot } from "$lib/types";

/** A container cell in SVG pixels, relative to the container's top-left. */
export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A row of cells in SVG pixels, relative to the container's top-left. */
export interface RowBand {
  /** The row id the cells share (position.row) */
  row: number;
  y: number;
  height: number;
}

/**
 * The container's rows, bottom row first.
 *
 * Rows are ranked by row id, lowest id at the bottom, so ids 0 and 2 are the
 * lower and upper rows. Each row is as tall as its tallest cell's
 * height_units (1 when unset), and the rows are scaled together to fill the
 * container: a 3U chassis with a 2U row and a 1U row draws them at 2U and 1U,
 * and a 1U carrier with two 0.5U rows draws two halves.
 *
 * @param slots - The container's slots
 * @param containerHeight - Container height in pixels
 */
export function getRowBands(slots: Slot[], containerHeight: number): RowBand[] {
  const rowUnits = new Map<number, number>();
  for (const slot of slots) {
    const row = slot.position.row;
    rowUnits.set(row, Math.max(rowUnits.get(row) ?? 0, slot.height_units ?? 1));
  }
  const rows = [...rowUnits.keys()].sort((a, b) => a - b);
  const totalUnits = rows.reduce((sum, row) => sum + rowUnits.get(row)!, 0);

  let bottom = containerHeight;
  let unitsBelow = 0;
  return rows.map((row, index) => {
    unitsBelow += rowUnits.get(row)!;
    // The top row ends exactly at 0, so rounding leaves no sliver above it.
    const top =
      index === rows.length - 1
        ? 0
        : containerHeight - (containerHeight * unitsBelow) / totalUnits;
    const band = { row, y: top, height: bottom - top };
    bottom = top;
    return band;
  });
}

/**
 * The row id at a y offset from the container's top edge. A y above or below
 * the container names the top or bottom row.
 *
 * @param slots - The container's slots
 * @param y - Y offset from the container's top edge, in pixels
 * @param containerHeight - Container height in pixels
 * @returns The row id, or undefined for a container without slots
 */
export function rowAtOffset(
  slots: Slot[],
  y: number,
  containerHeight: number,
): number | undefined {
  const bands = getRowBands(slots, containerHeight);
  return (bands.find((band) => y >= band.y) ?? bands[bands.length - 1])?.row;
}

/**
 * Slots in grid order: bottom row first, left to right within a row. Fill
 * order follows it, so the cell filled next does not depend on the order the
 * slots are listed in.
 *
 * @param slots - The container's slots
 */
export function slotsInGridOrder(slots: Slot[]): Slot[] {
  return [...slots].sort(
    (a, b) =>
      a.position.row - b.position.row || a.position.col - b.position.col,
  );
}

/**
 * Compute every slot's rectangle, keyed by slot id.
 *
 * Rows come from getRowBands. Within a row, x accumulates from the left in
 * position.col order, so array order does not matter. Each row lays out its
 * own columns, so rows may have different column counts and widths.
 *
 * @param slots - The container's slots
 * @param containerWidth - Container width in pixels
 * @param containerHeight - Container height in pixels
 */
export function getSlotRects(
  slots: Slot[],
  containerWidth: number,
  containerHeight: number,
): Map<string, SlotRect> {
  const rects = new Map<string, SlotRect>();
  const ordered = slotsInGridOrder(slots);

  for (const band of getRowBands(slots, containerHeight)) {
    let x = 0;
    for (const slot of ordered) {
      if (slot.position.row !== band.row) continue;
      const width = containerWidth * (slot.width_fraction ?? 1.0);
      rects.set(slot.id, { x, y: band.y, width, height: band.height });
      x += width;
    }
  }

  return rects;
}

/**
 * SVG y of a child inside its container.
 *
 * The child's position is in U from the bottom of the container (see
 * PlacedDevice.container_id). The result is clamped so the child sits inside
 * its own cell, and a child taller than its cell still stays inside the
 * container.
 *
 * @param cell - The child's slot rectangle from getSlotRects
 * @param containerHeight - Container height in pixels
 * @param childPosition - Child position in whole U from the container bottom
 *   (not internal units: migrateDevicePositions skips container children)
 * @param childUHeight - Child height in U
 * @param uHeight - Pixels per U
 */
export function getChildYInSlot(
  cell: SlotRect,
  containerHeight: number,
  childPosition: number,
  childUHeight: number,
  uHeight: number,
): number {
  const childHeight = childUHeight * uHeight;
  const fromContainer = containerHeight - childPosition * uHeight - childHeight;
  const lowest = cell.y + cell.height - childHeight;
  return Math.max(0, Math.min(Math.max(fromContainer, cell.y), lowest));
}
