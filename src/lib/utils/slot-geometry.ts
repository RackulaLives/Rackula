/**
 * Container cell geometry: where each slot of a carrier or chassis sits inside
 * the container, in SVG pixels relative to the container's top-left corner.
 *
 * RackDevice computes the cells once and uses them for both the rendered
 * children and the ContainerSlots overlay, so drop highlights line up with
 * the children drawn in them.
 */
import type { Slot } from "$lib/types";

export interface SlotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute every slot's rectangle, keyed by slot id.
 *
 * Rows are equal slices ranked by row id, lowest id at the bottom, so ids 0
 * and 2 are the lower and upper halves; rowAtY in dragdrop.ts uses the same
 * ranking. Within a row, x accumulates from the left in position.col order,
 * so array order does not matter. Per-row heights from height_units and
 * irregular column widths across rows are tracked in #3342.
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
  const rows = [...new Set(slots.map((s) => s.position.row))].sort(
    (a, b) => a - b,
  );
  const rowHeight = containerHeight / Math.max(rows.length, 1);

  rows.forEach((row, rowIndex) => {
    const y = containerHeight - (rowIndex + 1) * rowHeight;
    const rowSlots = slots
      .filter((s) => s.position.row === row)
      .sort((a, b) => a.position.col - b.position.col);

    let x = 0;
    for (const slot of rowSlots) {
      const width = containerWidth * (slot.width_fraction ?? 1.0);
      rects.set(slot.id, { x, y, width, height: rowHeight });
      x += width;
    }
  });

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
