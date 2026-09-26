/**
 * Height-matched two-column carriers for whole-U half-width gear.
 *
 * A half-width device cannot register on the rails by itself, so it rides in a
 * full-width carrier with two half-width columns. The carrier must be exactly
 * as tall as the device: a too-small carrier is the #2854 bug, and a too-tall
 * one would misrepresent the rack space the device consumes.
 *
 * This module has no imports so both the starter library (which defines the
 * carrier device types) and the collision/import layers (which synthesise them)
 * can share it without an import cycle.
 */

/** Tallest two-column carrier the starter library defines. */
export const MAX_TWO_COLUMN_CARRIER_U = 8;

/**
 * Stable slug of the two-column carrier for a given whole-U height
 * (carrier-1u-2col, carrier-2u-2col, ...). Layouts persist these slugs, so the
 * format must never change.
 *
 * @param uHeight - Whole-U carrier height
 * @returns The carrier slug
 */
export function twoColumnCarrierSlug(uHeight: number): string {
  return `carrier-${uHeight}u-2col`;
}

/**
 * Whether a two-column carrier exists for this height: a whole U from 1U up to
 * MAX_TWO_COLUMN_CARRIER_U.
 *
 * @param uHeight - Device height in U
 * @returns true when twoColumnCarrierSlug(uHeight) names a defined carrier
 */
export function hasTwoColumnCarrier(uHeight: number): boolean {
  return (
    Number.isInteger(uHeight) &&
    uHeight >= 1 &&
    uHeight <= MAX_TWO_COLUMN_CARRIER_U
  );
}
