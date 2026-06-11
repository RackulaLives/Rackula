/**
 * Canonical Rackula logo geometry: the coffin-tapered rack mark.
 *
 * Single source of truth for the brand mark. Components render from these
 * constants, and scripts/generate-brand-assets.ts writes the static SVG and
 * raster assets from them. Do not duplicate this geometry elsewhere.
 *
 * Grid: 56x80 tight bounding box.
 * Deliberate choices, do not "correct" them:
 * - The slot taper (3.6 units per slot) is about 2.4x the body taper.
 *   Exaggerated perspective, like looking down into the coffin.
 * - Corner radii are graduated (top 1.5, slots 2, bottom 2.5) to support
 *   the same perspective: nearer edges are rounder.
 */

export const LOGO_VIEWBOX = "0 0 56 80";

/**
 * Square canvas variant: the mark full-bleed vertically, centred
 * horizontally with 12-unit side margins from the 0.7 aspect ratio.
 * Use for favicons, icon rasters, and any square context.
 */
export const LOGO_SQUARE_VIEWBOX = "-12 0 80 80";

/** Coffin outline with fang notch, drawn clockwise from the top-left corner. */
export const LOGO_OUTLINE = `M1.5 0Q0 0 0 1.5L0 16.5L2.6 77.5Q2.6 80 5.1 80L50.9 80Q53.4 80 53.4 77.5L56 16.5L56 1.5Q56 0 54.5 0L39.5 0Q38.2 0 37 2.6L28 17.8L19 2.6Q17.8 0 16.5 0Z`;

interface LogoSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Device slots, narrowing toward the bottom. All centred on x=28. */
export const LOGO_SLOTS: readonly LogoSlot[] = [
  { x: 5.6, y: 21.5, width: 44.8, height: 13 },
  { x: 7.4, y: 40.5, width: 41.2, height: 13 },
  { x: 9.2, y: 59.5, width: 37.6, height: 13 },
];

export const LOGO_SLOT_RADIUS = 2;

/**
 * Builds a rounded-rectangle SVG subpath for a single device slot.
 *
 * The generated path uses `M`/`h`/`q`/`v` commands and closes with `Z`.
 * These slot subpaths are appended to `LOGO_OUTLINE` in `LOGO_PATH` and
 * rendered with `fill-rule="evenodd"` so the slots appear as punched-out holes.
 */
function slotSubpath({ x, y, width, height }: LogoSlot): string {
  const r = LOGO_SLOT_RADIUS;
  const w = width - 2 * r;
  const h = height - 2 * r;
  return (
    `M${x + r} ${y}h${w}q${r} 0 ${r} ${r}v${h}q0 ${r} -${r} ${r}` +
    `h-${w}q-${r} 0 -${r} -${r}v-${h}q0 -${r} ${r} -${r}Z`
  );
}

/**
 * Complete mark with the slots punched out as holes.
 * Render with fill-rule="evenodd" so the slots show the background through.
 */
export const LOGO_PATH = [LOGO_OUTLINE, ...LOGO_SLOTS.map(slotSubpath)].join(
  "",
);
