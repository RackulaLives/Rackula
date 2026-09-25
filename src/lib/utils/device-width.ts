/**
 * Device width helpers (#3310)
 *
 * Inside a container, width fit is a fraction of the rack's clear opening. A
 * measured width_mm wins over the slot_width descriptor (1 = half, 2 = full).
 * Kept free of store and schema imports so the schema, the store, and drag and
 * drop share one rule.
 */

import type { DeviceType } from "$lib/types";
import { MM_PER_INCH, RACK_EAR_ALLOWANCE_IN } from "$lib/types/constants";

/** Float tolerance so third-width cells (0.33 / 0.34) accept a third. */
const WIDTH_FIT_TOLERANCE = 0.01;

/** How far a measured width may exceed its cell, for rounding on entry. */
const WIDTH_FIT_TOLERANCE_MM = 0.5;

type WidthFields = Pick<DeviceType, "slot_width" | "width_mm">;

/** Units accepted when entering a device width. */
export const WIDTH_UNITS = ["mm", "cm", "in"] as const;
export type WidthUnit = (typeof WIDTH_UNITS)[number];

const MM_PER_UNIT: Record<WidthUnit, number> = {
  mm: 1,
  cm: 10,
  in: MM_PER_INCH,
};

/**
 * Published clear openings between the mounting rails, in millimetres:
 * - 10": 8.75 in, the mini rack opening (Project Mini Rack).
 * - 19": 450 mm, the EIA-310 minimum. The posts usually stand 17.75 in
 *   (450.85 mm) apart, but the minimum is what a device must fit.
 * - 21": 500 mm, the ETSI aperture between mounting flanges (ETS 300 119-3,
 *   W2).
 */
const PUBLISHED_OPENING_MM: Partial<Record<number, number>> = {
  10: 222.25,
  19: 450,
  21: 500,
};

/**
 * Clear opening between the mounting rails, in millimetres. A width with no
 * published opening (23") is approximated from its nominal width.
 * @param rackWidth - Nominal rack width in inches (10, 19, 21, 23)
 */
export function getRackOpeningMm(rackWidth: number): number {
  return (
    PUBLISHED_OPENING_MM[rackWidth] ??
    (rackWidth - RACK_EAR_ALLOWANCE_IN) * MM_PER_INCH
  );
}

/**
 * A cell's share of the opening, reading the rounded third descriptors
 * (0.33, 0.34, 0.66, 0.67) as exact thirds.
 *
 * Only those four values are read as thirds. Snapping everything within a
 * tolerance of a third would move a deliberate custom fraction: 0.343 would
 * shrink to a third and reject a device that fits, and 0.657 would grow to two
 * thirds and accept one that does not.
 */
function cellFraction(slotWidthFraction: number | undefined): number {
  const fraction = slotWidthFraction ?? 1.0;
  if (fraction === 0.33 || fraction === 0.34) return 1 / 3;
  if (fraction === 0.66 || fraction === 0.67) return 2 / 3;
  return fraction;
}

/**
 * Whether a device is narrow enough for a slot. A measured width is compared in
 * millimetres against the cell's share of the rack opening; otherwise
 * slot_width 1 needs a 0.5 cell and slot_width 2 (the default) a full cell.
 * @param deviceType - The device being fitted
 * @param slotWidthFraction - The slot's width_fraction (default 1.0)
 * @param rackWidth - Nominal rack width in inches
 */
export function fitsSlotWidth(
  deviceType: WidthFields,
  slotWidthFraction: number | undefined,
  rackWidth: number,
): boolean {
  if (deviceType.width_mm !== undefined) {
    const cellMm =
      cellFraction(slotWidthFraction) * getRackOpeningMm(rackWidth);
    return deviceType.width_mm <= cellMm + WIDTH_FIT_TOLERANCE_MM;
  }
  const requiredFraction = (deviceType.slot_width ?? 2) === 1 ? 0.5 : 1.0;
  return requiredFraction <= (slotWidthFraction ?? 1.0) + WIDTH_FIT_TOLERANCE;
}

/**
 * Whether a device is narrower than full width: half-width, or measured.
 * Measured gear is non-rackmount by nature, so it mounts in a carrier.
 */
export function isNarrowDevice(deviceType: WidthFields): boolean {
  return (
    (deviceType.slot_width ?? 2) === 1 || deviceType.width_mm !== undefined
  );
}

/**
 * Whether a device must mount inside a carrier rather than directly on the
 * rails (carrier-first rule, #2158). Sub-U, non-integer-height, or narrow
 * (half-width or measured) gear cannot register to whole-U rails. Blank filler
 * panels are exempt: a blank may rail-mount at any height. This is the single
 * predicate the schema (LayoutSchema.superRefine) and the store (placeDevice /
 * moveDevice) share so the two layers enforce identical rules.
 *
 * @param deviceType - The device being placed
 * @returns true when a rail placement is forbidden and a carrier is required
 */
export function requiresCarrier(
  deviceType: WidthFields & Pick<DeviceType, "category" | "u_height">,
): boolean {
  if (deviceType.category === "blank") return false;
  return (
    isNarrowDevice(deviceType) ||
    deviceType.u_height < 1 ||
    !Number.isInteger(deviceType.u_height)
  );
}

/**
 * Convert an entered width to millimetres, rounded to 0.1 mm.
 */
export function toMillimetres(value: number, unit: WidthUnit): number {
  return Math.round(value * MM_PER_UNIT[unit] * 10) / 10;
}

/**
 * Format a width in both unit systems, for example "72 mm (2.83 in)".
 */
export function formatWidthMm(widthMm: number): string {
  const inches = Math.round((widthMm / MM_PER_INCH) * 100) / 100;
  return `${widthMm} mm (${inches} in)`;
}
