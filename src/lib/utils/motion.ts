/**
 * Motion preference utilities for accessibility.
 * Respects user's prefers-reduced-motion system preference.
 */

/**
 * Check if user prefers reduced motion.
 * @returns true if user has enabled reduced motion in system settings
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Get appropriate animation duration based on motion preference.
 * @param normalDuration - Duration in milliseconds when motion is allowed
 * @returns 0 if reduced motion is preferred, otherwise the normal duration
 */
export function getAnimationDuration(normalDuration: number): number {
  return prefersReducedMotion() ? 0 : normalDuration;
}
