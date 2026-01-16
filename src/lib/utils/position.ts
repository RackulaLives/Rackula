/**
 * Position Conversion Utilities
 *
 * Internal positions are stored as multiples of 1/6U for precision.
 * This supports both 1/2U devices (3 internal units) and 1/3U hole-aligned
 * positioning (2 internal units) without floating-point precision issues.
 *
 * Position mapping:
 * | Human | Internal |
 * |-------|----------|
 * | U1    | 6        |
 * | U1⅓   | 8        |
 * | U1½   | 9        |
 * | U2    | 12       |
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
