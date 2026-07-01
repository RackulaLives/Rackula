/**
 * Rack frame chrome geometry (issue #2735).
 *
 * The U-grid, rails, mounting holes and labels are identical for every rack;
 * this module derives the outer frame geometry from the frame metrics so
 * RackFrame.svelte can stay a thin renderer and the mapping can be unit-tested.
 *
 * The per-form-factor chrome added in #2735 (PR #2752) drew distracting
 * decorations on the canvas and is disabled here (issue #2805): every form
 * factor now returns the generic frame (solid top/bottom bars and no decorative
 * shapes). The `form_factor` data path is untouched, so the variant chrome can
 * be restored from git history once the visuals are fixed.
 *
 * Coordinates are in the same SVG user space as RackFrame.svelte.
 */
import type { FormFactor } from "$lib/types";

export interface FrameMetrics {
  /** Total rack width in pixels. */
  rackWidth: number;
  /** Rail width in pixels. */
  railWidth: number;
  /** Total height of all U slots in pixels. */
  totalHeight: number;
  /** Top padding above the rack (the rack-name area). */
  rackPadding: number;
}

/** A horizontal frame bar (the top or bottom of the frame). */
export interface FrameBar {
  /** Top edge in SVG user space. */
  y: number;
  /** Bar height (the full rail width, reading as a solid enclosing bar). */
  height: number;
}

/** A single decorative chrome primitive, fill/stroke supplied by a CSS class. */
export type FrameShape =
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      cls: string;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      cls: string;
    }
  | { kind: "circle"; cx: number; cy: number; r: number; cls: string }
  | { kind: "path"; d: string; cls: string };

export interface FrameChrome {
  /** The form factor this chrome represents. */
  variant: FormFactor;
  /** Top horizontal bar geometry. */
  topBar: FrameBar;
  /** Bottom horizontal bar geometry. */
  bottomBar: FrameBar;
  /** Decorative chrome drawn behind the U-grid and devices. */
  shapes: FrameShape[];
}

/**
 * Compute the frame chrome for a form factor.
 *
 * The per-form-factor decorative chrome (#2735 / PR #2752) is disabled
 * (issue #2805): every form factor returns the generic frame with solid
 * top/bottom bars and no decorative shapes. The variant chrome can be restored
 * from git history once the visuals are fixed.
 *
 * @param formFactor Rack form factor (carried through as the chrome variant).
 * @param metrics Frame metrics in SVG user space.
 * @returns The generic frame bars with no decorative shapes.
 */
export function frameChromeFor(
  formFactor: FormFactor,
  metrics: FrameMetrics,
): FrameChrome {
  const { railWidth, totalHeight, rackPadding } = metrics;

  const topZoneY = rackPadding;
  const gridBottom = rackPadding + railWidth + totalHeight;

  const solidTop: FrameBar = { y: topZoneY, height: railWidth };
  const solidBottom: FrameBar = { y: gridBottom, height: railWidth };

  return {
    variant: formFactor,
    topBar: solidTop,
    bottomBar: solidBottom,
    shapes: [],
  };
}
