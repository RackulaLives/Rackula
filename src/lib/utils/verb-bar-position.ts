/**
 * Pure verb bar positioning math (#2075, #2388)
 *
 * Computes where to render a floating verb bar relative to a selected object.
 * No DOM access, no globals - all inputs are plain numeric rects so the
 * function is deterministic and unit-testable in isolation.
 *
 * Rules:
 * 1. LOW ZOOM: hidden when scale < VERB_BAR_LOW_ZOOM_THRESHOLD.
 * 2. HORIZONTAL: centred over the target, clamped within viewport margins.
 * 3. VERTICAL: placed above the target by default. Flips to below when the
 *    computed above-top would be less than VERB_BAR_FLIP_THRESHOLD pixels
 *    from the viewport top, so the bar does not occlude the device label
 *    or sit off-screen when the device is near the rack header.
 */

/** Viewport-space bounding rectangle using plain numbers (no DOM dependency). */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

/** A width/height pair in pixels. */
export interface Size {
  width: number;
  height: number;
}

export interface VerbBarPositionInput {
  /** Viewport-space rect of the selected object the bar points at (device row, or rack name). */
  target: Rect;
  /** Measured size of the bar. */
  bar: Size;
  /** Viewport dimensions, for horizontal clamping. */
  viewport: Size;
  /** Current canvas zoom scale (1 = 100%). */
  scale: number;
}

export type VerbBarPlacement = "above" | "below";

export interface VerbBarPosition {
  visible: boolean;
  left: number;
  top: number;
  placement: VerbBarPlacement;
}

/** Gap in px between the bar and the target edge. */
export const VERB_BAR_MARGIN = 8;

/** Bar is hidden when zoom is below this scale to keep the UI uncluttered. */
export const VERB_BAR_LOW_ZOOM_THRESHOLD = 0.5;

/**
 * Minimum viewport-top distance (px) for the above position.
 * When the computed above-top is less than this, the bar flips below the
 * target to avoid occluding the device label or sitting off-screen.
 */
export const VERB_BAR_FLIP_THRESHOLD = 80;

/**
 * Compute viewport coordinates for a floating verb bar.
 *
 * Returns visible:false when zoomed out below the threshold. Otherwise
 * returns the clamped horizontal position and a vertical position that is
 * above the target by default, flipping to below when the device is near
 * the top of the viewport.
 */
export function computeVerbBarPosition(
  input: VerbBarPositionInput,
): VerbBarPosition {
  const { target, bar, viewport, scale } = input;

  if (scale < VERB_BAR_LOW_ZOOM_THRESHOLD) {
    return { visible: false, left: 0, top: 0, placement: "above" };
  }

  // Horizontal: centre over the target, clamped within viewport margins.
  const rawLeft = target.left + target.width / 2 - bar.width / 2;
  const maxLeft = viewport.width - bar.width - VERB_BAR_MARGIN;
  const left = Math.max(VERB_BAR_MARGIN, Math.min(rawLeft, maxLeft));

  // Vertical: prefer above, but flip below when there is insufficient room.
  const aboveTop = target.top - VERB_BAR_MARGIN - bar.height;
  if (aboveTop < VERB_BAR_FLIP_THRESHOLD) {
    const top = target.bottom + VERB_BAR_MARGIN;
    return { visible: true, left, top, placement: "below" };
  }

  return { visible: true, left, top: aboveTop, placement: "above" };
}
