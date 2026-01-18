/**
 * Position Conversion Utilities
 *
 * Internal units use UNITS_PER_U = 6 (LCM of 2 and 3) for integer math:
 * - Hole positions: 1/3U = 2 internal units (racks have 3 holes per U)
 * - Device heights: 1/2U = 3 internal units (smallest device is 0.5U)
 *
 * This avoids floating-point precision issues in collision detection.
 *
 * Position mapping:
 * | Human | Internal | Notes                    |
 * |-------|----------|--------------------------|
 * | U1    | 6        | Standard position        |
 * | U1⅓   | 8        | Offset by one hole       |
 * | U1½   | 9        | Half-U device boundary   |
 * | U2    | 12       | Standard position        |
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
 * Format an internal position as a human-readable string with Unicode fraction glyphs.
 *
 * Device positions only occur at hole boundaries (multiples of 2 internal units).
 * The odd internal values (1, 3, 5) are used for device HEIGHT calculations (1/2U = 3 units),
 * not positions, so they shouldn't appear in practice but are handled for completeness.
 *
 * @param internal - Internal position (e.g., 6 = U1, 8 = U1⅓, 12 = U2)
 * @returns Formatted position string (e.g., "U1", "U1⅓", "U2")
 *
 * @example
 * formatPosition(6)  // "U1"
 * formatPosition(8)  // "U1⅓"
 * formatPosition(10) // "U1⅔"
 * formatPosition(12) // "U2"
 */
export function formatPosition(internal: number): string {
  const wholeU = Math.floor(internal / UNITS_PER_U);
  const remainder = internal % UNITS_PER_U;

  // Map remainder to Unicode fraction glyphs
  // Positions only occur at hole boundaries (multiples of 2)
  const fractionMap: Record<number, string> = {
    0: "", // whole U
    1: "⅙", // 1/6 U (rare, for nerd mode)
    2: "⅓", // 1/3 U (one hole up)
    3: "½", // 1/2 U (half-U device boundary)
    4: "⅔", // 2/3 U (two holes up)
    5: "⅚", // 5/6 U (rare, for nerd mode)
  };

  return `U${wholeU}${fractionMap[remainder] ?? ""}`;
}
