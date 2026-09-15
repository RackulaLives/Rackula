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
 * Clear opening between the mounting rails, in millimetres.
 * @param rackWidth - Nominal rack width in inches (10, 19, 21, 23)
 */
export function getRackOpeningMm(rackWidth: number): number {
  return (rackWidth - RACK_EAR_ALLOWANCE_IN) * MM_PER_INCH;
}

/**
 * Share of the rack opening a device needs.
 * @param deviceType - The device being fitted
 * @param rackWidth - Nominal rack width in inches
 */
export function getDeviceWidthFraction(
  deviceType: WidthFields,
  rackWidth: number,
): number {
  if (deviceType.width_mm !== undefined) {
    return deviceType.width_mm / getRackOpeningMm(rackWidth);
  }
  return (deviceType.slot_width ?? 2) === 1 ? 0.5 : 1.0;
}

/**
 * Whether a device is narrow enough for a slot.
 * @param deviceType - The device being fitted
 * @param slotWidthFraction - The slot's width_fraction (default 1.0)
 * @param rackWidth - Nominal rack width in inches
 */
export function fitsSlotWidth(
  deviceType: WidthFields,
  slotWidthFraction: number | undefined,
  rackWidth: number,
): boolean {
  return (
    getDeviceWidthFraction(deviceType, rackWidth) <=
    (slotWidthFraction ?? 1.0) + WIDTH_FIT_TOLERANCE
  );
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
