/**
 * Canvas level of detail (#3367)
 *
 * SVG `<text>` is what makes zoom expensive: Chrome re-lays-out every text
 * element at each new scale, while other elements barely register (spike
 * #3293). Below a legibility floor the canvas stops rendering text labels.
 *
 * Zoom is quantised into tiers so consumers react to a tier change, not to
 * every wheel tick, and each boundary has separate enter and exit thresholds
 * so a slow zoom or trackpad pinch hovering near it does not thrash.
 *
 * Thresholds come from screen-space font size. The smallest canvas labels are
 * U numbers at 10px (--font-size-2xs); device names are 11px. Text under about
 * 5 screen pixels is unreadable, which the 10px U labels reach at zoom 0.5.
 * Labels drop out below 0.45 (4.5px) and return at 0.5 (5px). Returning at
 * exactly 0.5 keeps the zoom ladder rungs deterministic: 0.5 always shows
 * labels and 0.25 never does, whichever direction the user came from.
 */

/** "full" renders everything; "reduced" omits text labels. */
export type LodTier = "full" | "reduced";

/** Zoom below which a full-detail canvas drops to the reduced tier. */
export const LOD_REDUCED_ENTER_BELOW = 0.45;

/** Zoom at or above which a reduced canvas returns to full detail. */
export const LOD_REDUCED_EXIT_AT = 0.5;

/**
 * Next LOD tier for a zoom level, given the current tier. Between the two
 * thresholds the current tier is kept (hysteresis).
 */
export function nextLodTier(current: LodTier, zoom: number): LodTier {
  if (current === "full") {
    return zoom < LOD_REDUCED_ENTER_BELOW ? "reduced" : "full";
  }
  return zoom >= LOD_REDUCED_EXIT_AT ? "full" : "reduced";
}
