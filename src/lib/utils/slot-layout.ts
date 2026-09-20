/**
 * Cell and gap geometry for a container row.
 *
 * ContainerSlots, RackDevice and the drop targeting each used to walk the
 * slots array themselves. They now share this one function, so a gap inserted
 * between two cells shifts the drawn cell, the drawn child and the drop target
 * together.
 *
 * Gaps read only on a single-row container. A grid carrier (the 2x2) has no
 * way to name a boundary inside one of its rows with a flat list, so it keeps
 * the gapless layout.
 */

import type { DeviceType } from "$lib/types";
import { getRackOpeningMm } from "./device-width";

/** A drawn cell: where it starts and how wide it is, in pixels. */
export interface SlotBand {
  id: string;
  x: number;
  width: number;
}

/** A drawn gap between cell `index` and cell `index + 1`. */
export interface GapBand {
  index: number;
  x: number;
  width: number;
  mm: number;
}

/** Everything drawn across a container row. */
export interface SlotLayout {
  slots: SlotBand[];
  gaps: GapBand[];
  /** Unclaimed space at the end of the row, or null when the row is full. */
  free: { x: number; width: number } | null;
}

/** Pixels below which leftover space is rounding noise, not free space. */
const FREE_SPACE_EPSILON_PX = 0.5;

/** Rounding slack when comparing a row's contents to the opening. */
const ROW_FIT_TOLERANCE_MM = 0.5;

/** Whether every cell sits on one row, the only shape gaps apply to. */
function isSingleRow(containerType: DeviceType): boolean {
  const slots = containerType.slots ?? [];
  return new Set(slots.map((s) => s.position.row)).size <= 1;
}

/**
 * The gaps that actually apply: none for a grid carrier, none when the list
 * is absent or the wrong length for the cell count.
 *
 * @param containerType - The container being laid out
 * @returns n - 1 gap widths in millimetres, or an empty list
 */
export function gapsFor(containerType: DeviceType): number[] {
  const slots = containerType.slots ?? [];
  const gaps = containerType.slot_gaps;
  if (!gaps || !isSingleRow(containerType)) return [];
  if (gaps.length !== Math.max(slots.length - 1, 0)) return [];
  return gaps;
}

/**
 * Place every cell and gap across the container's interior.
 *
 * @param containerType - The container DeviceType (with slots[])
 * @param interiorWidth - Drawn width of the container interior, in pixels
 * @param rackWidth - Nominal rack width in inches, to size gaps in millimetres
 * @returns Cell bands, gap bands, and any free space left at the end
 */
export function slotLayout(
  containerType: DeviceType,
  interiorWidth: number,
  rackWidth: number,
): SlotLayout {
  const slots = containerType.slots ?? [];
  const gapsMm = gapsFor(containerType);
  const openingMm = getRackOpeningMm(rackWidth);
  const pxPerMm = openingMm > 0 ? interiorWidth / openingMm : 0;

  const bands: SlotBand[] = [];
  const gapBands: GapBand[] = [];
  let x = 0;

  slots.forEach((slot, index) => {
    const gapMm = index > 0 ? (gapsMm[index - 1] ?? 0) : 0;
    if (gapMm > 0) {
      const width = gapMm * pxPerMm;
      gapBands.push({ index: index - 1, x, width, mm: gapMm });
      x += width;
    }
    const width = interiorWidth * (slot.width_fraction ?? 1.0);
    bands.push({ id: slot.id, x, width });
    x += width;
  });

  const leftover = interiorWidth - x;
  return {
    slots: bands,
    gaps: gapBands,
    free: leftover > FREE_SPACE_EPSILON_PX ? { x, width: leftover } : null,
  };
}

/**
 * Millimetres of the opening the row already claims: every cell plus every
 * gap between them.
 *
 * @param containerType - The container being measured
 * @param rackWidth - Nominal rack width in inches
 */
export function usedMm(containerType: DeviceType, rackWidth: number): number {
  const openingMm = getRackOpeningMm(rackWidth);
  const cells = (containerType.slots ?? []).reduce(
    (total, slot) => total + openingMm * (slot.width_fraction ?? 1.0),
    0,
  );
  const gaps = gapsFor(containerType).reduce((total, mm) => total + mm, 0);
  return cells + gaps;
}

/**
 * Millimetres still free at the end of the row.
 *
 * @param containerType - The container being measured
 * @param rackWidth - Nominal rack width in inches
 */
export function remainingMm(
  containerType: DeviceType,
  rackWidth: number,
): number {
  return getRackOpeningMm(rackWidth) - usedMm(containerType, rackWidth);
}

/**
 * Whether `extraMm` more millimetres still fit in the row.
 *
 * @param containerType - The container being added to
 * @param rackWidth - Nominal rack width in inches
 * @param extraMm - Millimetres the caller wants to add (cell plus any gap)
 */
export function fitsInRow(
  containerType: DeviceType,
  rackWidth: number,
  extraMm: number,
): boolean {
  return (
    usedMm(containerType, rackWidth) + extraMm <=
    getRackOpeningMm(rackWidth) + ROW_FIT_TOLERANCE_MM
  );
}
