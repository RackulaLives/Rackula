/**
 * Position Conversion Utilities
 *
 * Internal units use UNITS_PER_U = 6 for integer math: device heights step in
 * 1/2U (= 3 internal units, the smallest device is 0.5U). Rails register
 * equipment at whole-U boundaries only (carrier-first, #2158); sub-U gear
 * mounts inside a carrier, so rail positions land on multiples of UNITS_PER_U.
 *
 * This keeps height math integer and avoids floating-point precision issues in
 * collision detection.
 *
 * Position mapping:
 * | Human | Internal | Notes             |
 * |-------|----------|-------------------|
 * | U1    | 6        | Standard position |
 * | U2    | 12       | Standard position |
 */

import { UNITS_PER_U } from "$lib/types/constants";

// Re-export for convenience
export { UNITS_PER_U };

/**
 * Convert human U position to internal units.
 * @param humanU - Position in U (e.g., 1, 1.5, 2)
 * @returns Internal position (e.g., 6, 9, 12)
 */
export function toInternalUnits(humanU: number): number {
  return Math.round(humanU * UNITS_PER_U);
}

/**
 * Convert internal units to human U position.
 * @param internal - Internal position (e.g., 6, 9, 12)
 * @returns Position in U (e.g., 1, 1.5, 2)
 */
export function toHumanUnits(internal: number): number {
  return internal / UNITS_PER_U;
}

/**
 * Convert device height in U to internal units.
 * @param heightU - Height in U (e.g., 1, 2, 0.5)
 * @returns Height in internal units (e.g., 6, 12, 3)
 */
export function heightToInternalUnits(heightU: number): number {
  return Math.round(heightU * UNITS_PER_U);
}

/**
 * Format an internal rail position as a whole-U label.
 *
 * Carrier-first (#2158): rails register equipment at whole-U boundaries only,
 * so a rail position is a whole number of U. Any internal value is rounded to
 * the nearest whole U for display; sub-U gear is labelled by its carrier slot
 * reference (see DeviceDetails / EditPanelPosition), not a fractional U.
 *
 * @param internal - Internal position (e.g., 6 = U1, 12 = U2)
 * @returns Formatted position string (e.g., "U1", "U2")
 *
 * @example
 * formatPosition(6)  // "U1"
 * formatPosition(12) // "U2"
 */
export function formatPosition(internal: number): string {
  const wholeU = Math.round(internal / UNITS_PER_U);
  return `U${wholeU}`;
}

/**
 * Format an internal rail position as a whole-U label, honouring the rack's
 * U-numbering direction (`desc_units`, "U1 at top") and starting offset
 * (`starting_unit`).
 *
 * The rail position (`position`) is always measured from the physical
 * bottom of the rack regardless of `desc_units` (#2158); only the label
 * shown on the ruler flips and offsets. This mirrors the formula the ruler
 * itself applies (Rack.svelte's `uLabels`): for row index `i` counted from
 * the top (`i = height - wholeU`), the ruler labels a descending rack
 * `starting_unit + i` and an ascending rack
 * `starting_unit + (height - 1) - i`. Without `starting_unit`, a rack whose
 * numbering starts above 1 (e.g. a continuation rack) would show a label
 * that diverges from the ruler.
 *
 * @param position - Internal position (e.g., 6 = U1, 12 = U2)
 * @param height - Rack height in U
 * @param desc_units - Whether the rack numbers U1 at the top (descending)
 * @param starting_unit - The rack's first U number (default: 1)
 * @returns Formatted position string matching the ruler's label
 *
 * @example
 * formatDisplayPosition(6, 42, false)      // "U1" (ascending, U1 at bottom)
 * formatDisplayPosition(6, 42, true)       // "U42" (descending, U1 at top)
 * formatDisplayPosition(6, 42, false, 25)  // "U25" (ascending, starts at U25)
 */
export function formatDisplayPosition(
  position: number,
  height: number,
  desc_units?: boolean,
  starting_unit?: number,
): string {
  const startUnit = starting_unit ?? 1;
  const wholeU = Math.round(toHumanUnits(position));
  const displayWholeU = desc_units
    ? startUnit + height - wholeU
    : startUnit + wholeU - 1;
  return formatPosition(toInternalUnits(displayWholeU));
}
