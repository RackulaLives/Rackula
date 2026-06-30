/**
 * Per-form-factor rack frame chrome (issue #2735).
 *
 * The U-grid, rails, mounting holes and labels are identical for every rack;
 * only the outer frame chrome changes by form factor. This module derives that
 * chrome geometry from the frame metrics so RackFrame.svelte can stay a thin
 * renderer and the mapping can be unit-tested.
 *
 * Each form factor is grounded in the real hardware it represents:
 * - 4-post-cabinet: an enclosed box with a door-panel outline and handle.
 * - 4-post: an open frame shown with depth (a recessed rear plane and struts).
 * - 2-post: a telco rack: a central mounting strip on a floor stand.
 * - wall-mount: a compact frame bolted to a wall via corner mounting plates.
 * - open-frame: a bare skeleton: thin ties with angled corner braces.
 *
 * Coordinates are in the same SVG user space as RackFrame.svelte. The frame
 * decorations never move the rails off whole-U boundaries: rails and holes are
 * unchanged, and the chrome is additive.
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
  /** Bar height. The full rail width reads as a solid enclosing bar; a thin
   *  value reads as an open tie between the rails. */
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
 * @param formFactor Rack form factor.
 * @param metrics Frame metrics in SVG user space.
 * @returns The bars and decorative shapes that make the frame recognisable.
 */
export function frameChromeFor(
  formFactor: FormFactor,
  metrics: FrameMetrics,
): FrameChrome {
  const { rackWidth, railWidth, totalHeight, rackPadding } = metrics;

  // Frame landmarks in SVG user space. All chrome stays within the rack's own
  // bounds (x in [0, rackWidth]) so it never overlaps neighbouring racks in the
  // canvas row and is never clipped by an element-level screenshot.
  const topZoneY = rackPadding;
  const gridTop = rackPadding + railWidth;
  const gridBottom = gridTop + totalHeight;
  const frameBottom = gridBottom + railWidth;
  const thin = railWidth * 0.4;
  const mid = rackWidth / 2;

  const solidTop: FrameBar = { y: topZoneY, height: railWidth };
  const solidBottom: FrameBar = { y: gridBottom, height: railWidth };
  const thinTop: FrameBar = { y: gridTop - thin, height: thin };
  const thinBottom: FrameBar = { y: gridBottom, height: thin };

  switch (formFactor) {
    case "4-post-cabinet": {
      // A door panel: a rounded outline tracing the centreline of the bars and
      // rails, reading as the seam of an enclosed cabinet.
      const inset = railWidth * 0.5;
      return {
        variant: formFactor,
        topBar: solidTop,
        bottomBar: solidBottom,
        shapes: [
          {
            kind: "rect",
            x: inset,
            y: topZoneY + inset,
            width: rackWidth - inset * 2,
            height: frameBottom - topZoneY - inset * 2,
            rx: railWidth * 0.6,
            cls: "frame-cabinet-enclosure",
          },
          {
            kind: "circle",
            cx: rackWidth - railWidth * 1.1,
            cy: (topZoneY + frameBottom) / 2,
            r: railWidth * 0.18,
            cls: "frame-cabinet-handle",
          },
        ],
      };
    }

    case "4-post": {
      // Depth: a back plane drawn up and inset from the front, joined to the
      // front corners by struts, giving an open four-post box in perspective.
      // The upward shift is clamped to topZoneY so the rear geometry never goes
      // above y=0, which the viewBox clips when the rack name is hidden (bayed
      // and dual views use a near-zero top padding).
      const depth = railWidth * 0.8;
      const vDepth = Math.min(depth, topZoneY);
      const front: Array<[number, number]> = [
        [0, topZoneY],
        [rackWidth, topZoneY],
        [0, frameBottom],
        [rackWidth, frameBottom],
      ];
      const strut = ([x, y]: [number, number]): FrameShape => ({
        kind: "line",
        x1: x,
        y1: y,
        x2: x === 0 ? x + depth : x - depth,
        y2: y - vDepth,
        cls: "frame-rear-strut",
      });
      return {
        variant: formFactor,
        topBar: solidTop,
        bottomBar: solidBottom,
        shapes: [
          {
            kind: "rect",
            x: depth,
            y: topZoneY - vDepth,
            width: rackWidth - depth * 2,
            height: frameBottom - topZoneY,
            cls: "frame-rear-outline",
          },
          ...front.map(strut),
        ],
      };
    }

    case "2-post": {
      // Two posts (the side rails) on an open frame: a central mounting strip
      // and a floor stand, with thin ties top and bottom.
      const stripW = railWidth * 0.7;
      const standW = rackWidth * 0.45;
      return {
        variant: formFactor,
        topBar: thinTop,
        bottomBar: thinBottom,
        shapes: [
          {
            kind: "rect",
            x: mid - stripW / 2,
            y: gridTop,
            width: stripW,
            height: totalHeight,
            cls: "frame-center-strip",
          },
          {
            kind: "rect",
            x: mid - standW / 2,
            y: gridBottom + thin,
            width: standW,
            height: railWidth - thin,
            rx: (railWidth - thin) * 0.3,
            cls: "frame-base-stand",
          },
        ],
      };
    }

    case "wall-mount": {
      // Mounting plates with screw holes at the four corners: a compact frame
      // bolted to a wall.
      const plateW = railWidth * 1.15;
      const plateH = railWidth * 0.9;
      const screwR = railWidth * 0.16;
      const corners: Array<[number, number]> = [
        [0, topZoneY],
        [rackWidth - plateW, topZoneY],
        [0, frameBottom - plateH],
        [rackWidth - plateW, frameBottom - plateH],
      ];
      return {
        variant: formFactor,
        topBar: solidTop,
        bottomBar: solidBottom,
        shapes: [
          ...corners.flatMap(([x, y]): FrameShape[] => [
            {
              kind: "rect",
              x,
              y,
              width: plateW,
              height: plateH,
              rx: railWidth * 0.2,
              cls: "frame-wall-bracket",
            },
            {
              kind: "circle",
              cx: x + plateW / 2,
              cy: y + plateH / 2,
              r: screwR,
              cls: "frame-wall-screw",
            },
          ]),
        ],
      };
    }

    case "open-frame": {
      // A bare skeleton: thin ties with diagonal corner braces on the rails.
      const braceLen = railWidth * 1.6;
      return {
        variant: formFactor,
        topBar: thinTop,
        bottomBar: thinBottom,
        shapes: [
          {
            kind: "line",
            x1: 0,
            y1: gridTop + braceLen,
            x2: railWidth,
            y2: gridTop,
            cls: "frame-open-gusset",
          },
          {
            kind: "line",
            x1: rackWidth,
            y1: gridTop + braceLen,
            x2: rackWidth - railWidth,
            y2: gridTop,
            cls: "frame-open-gusset",
          },
          {
            kind: "line",
            x1: 0,
            y1: gridBottom - braceLen,
            x2: railWidth,
            y2: gridBottom,
            cls: "frame-open-gusset",
          },
          {
            kind: "line",
            x1: rackWidth,
            y1: gridBottom - braceLen,
            x2: rackWidth - railWidth,
            y2: gridBottom,
            cls: "frame-open-gusset",
          },
        ],
      };
    }
  }
}
