/**
 * Canvas Utility Functions
 * Canvas layout geometry (stacked rows of racks and groups) and the camera
 * maths built on it: fit-all, focus and ensure-visible.
 */

import type { Rack, RackGroup } from "$lib/types";
import {
  U_HEIGHT_PX,
  RAIL_WIDTH,
  RACK_PADDING_HIDDEN,
  RACK_GAP,
  RACK_ROW_PADDING,
  DUAL_VIEW_GAP,
  FIT_ALL_PADDING,
  FIT_ALL_MAX_ZOOM,
  getRackWidth,
} from "$lib/constants/layout";
import { organizeRackRows, type RackRowItem } from "$lib/utils/rack-row";

/**
 * Bounding box interface
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rack position interface for bounding box calculation
 */
export interface RackPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rack position with associated rack IDs
 * Used for mapping positions back to specific racks
 */
export interface RackPositionWithIds extends RackPosition {
  rackIds: string[];
}

/**
 * Fit-all result with zoom and pan values
 */
export interface FitAllResult {
  zoom: number;
  panX: number;
  panY: number;
}

// FIT_ALL_PADDING and FIT_ALL_MAX_ZOOM imported from layout constants

/**
 * Calculate the bounding box that encompasses all racks.
 *
 * @param racks - Array of rack positions with x, y, width, height
 * @returns Bounding box { x, y, width, height } or zero bounds for empty array
 */
export function calculateRacksBoundingBox(racks: RackPosition[]): Bounds {
  if (racks.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rack of racks) {
    minX = Math.min(minX, rack.x);
    minY = Math.min(minY, rack.y);
    maxX = Math.max(maxX, rack.x + rack.width);
    maxY = Math.max(maxY, rack.y + rack.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Minimum zoom level (must match ZOOM_MIN in canvas store)
 */
const FIT_ALL_MIN_ZOOM = 0.25;

/**
 * Calculate zoom and pan values to fit all racks in the viewport.
 *
 * The calculation:
 * 1. Find bounding box of all racks
 * 2. Add padding around the content
 * 3. Calculate zoom to fit content in viewport
 * 4. Clamp zoom between min (50%) and max (200%)
 * 5. Calculate pan to center content (using clamped zoom)
 *
 * @param racks - Array of rack positions
 * @param viewportWidth - Width of the viewport in pixels
 * @param viewportHeight - Height of the viewport in pixels
 * @returns { zoom, panX, panY } values for panzoom
 */
export function calculateFitAll(
  racks: RackPosition[],
  viewportWidth: number,
  viewportHeight: number,
): FitAllResult {
  if (racks.length === 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  const bounds = calculateRacksBoundingBox(racks);

  // The actual visual content includes the rack-row's CSS padding
  const visualContentWidth = bounds.width + RACK_ROW_PADDING * 2;
  const visualContentHeight = bounds.height + RACK_ROW_PADDING * 2;

  // For zoom calculation, add extra visual margin (FIT_ALL_PADDING) around the content
  const contentWithMarginWidth = visualContentWidth + FIT_ALL_PADDING * 2;
  const contentWithMarginHeight = visualContentHeight + FIT_ALL_PADDING * 2;

  // Calculate zoom to fit content with margin in viewport
  const zoomX = viewportWidth / contentWithMarginWidth;
  const zoomY = viewportHeight / contentWithMarginHeight;

  // Use smaller zoom to ensure content fits, clamp between min and max
  const zoom = Math.max(
    FIT_ALL_MIN_ZOOM,
    Math.min(zoomX, zoomY, FIT_ALL_MAX_ZOOM),
  );

  // Calculate pan to center the content in the viewport
  // The content is at canvas position (bounds.x, bounds.y)
  // We need to pan so the content's center appears at the viewport's center
  //
  // Panzoom transform: screenPos = canvasPos * zoom + pan
  // To center: viewportCenter = contentCenter * zoom + pan
  // Therefore: pan = viewportCenter - contentCenter * zoom

  // Content center is the center of the actual bounds (not including visual padding)
  const contentCenterX = bounds.x + bounds.width / 2;
  const contentCenterY = bounds.y + bounds.height / 2;

  let panX = viewportWidth / 2 - contentCenterX * zoom;
  let panY = viewportHeight / 2 - contentCenterY * zoom;

  // If content is larger than viewport, align to top-left with padding
  const scaledContentWidth = visualContentWidth * zoom;
  const scaledContentHeight = visualContentHeight * zoom;

  if (scaledContentWidth > viewportWidth) {
    // Content wider than viewport - align left edge of content to left edge of viewport
    panX = FIT_ALL_PADDING - bounds.x * zoom;
  }

  if (scaledContentHeight > viewportHeight) {
    // Content taller than viewport - align top edge of content to top edge of viewport
    panY = FIT_ALL_PADDING - bounds.y * zoom;
  }

  return { zoom, panX, panY };
}

/**
 * Viewport rectangle in screen pixels.
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Panzoom transform: screenPos = canvasPos * scale + pan.
 */
export interface Transform {
  scale: number;
  panX: number;
  panY: number;
}

/**
 * Clamp a pan offset on one axis so the target extent stays inside the viewport.
 *
 * The near edge (canvas `start`) must satisfy start*scale + pan >= 0, and the
 * far edge (canvas start+size) must satisfy (start+size)*scale + pan <=
 * viewportSize. When the scaled extent is wider than the viewport the two
 * bounds cross; align the near edge to the viewport origin so the top/left
 * stays visible, matching the top-left alignment in calculateFitAll.
 */
function clampPanAxis(
  pan: number,
  start: number,
  size: number,
  scale: number,
  viewportSize: number,
): number {
  const panForNearEdge = -start * scale; // pan >= this keeps the near edge visible
  const panForFarEdge = viewportSize - (start + size) * scale; // pan <= this
  const clamped =
    panForNearEdge > panForFarEdge
      ? panForNearEdge
      : Math.min(Math.max(pan, panForNearEdge), panForFarEdge);
  // Normalise -0 to 0 so callers get stable, comparable pan values.
  return clamped === 0 ? 0 : clamped;
}

/**
 * Compute the minimal transform that keeps `target` (canvas coords) fully
 * visible in the viewport, given the current transform.
 *
 * Returns the current transform unchanged when the target already fits inside
 * the viewport. Only ever zooms out (never in) and pans by the least amount
 * needed. A shrinking or already-contained extent is therefore a no-op, so a
 * caller can invoke this on every direct-manipulation commit without special-
 * casing grow vs. shrink.
 *
 * @param target - Extent to keep visible, in canvas coordinates
 * @param viewport - Viewport size in screen pixels
 * @param current - Current panzoom transform
 * @param minZoom - Lowest zoom the result may use (default FIT_ALL_MIN_ZOOM)
 * @param maxZoom - Highest zoom the result may use (default FIT_ALL_MAX_ZOOM)
 */
export function ensureVisibleTransform(
  target: Bounds,
  viewport: Viewport,
  current: Transform,
  minZoom: number = FIT_ALL_MIN_ZOOM,
  maxZoom: number = FIT_ALL_MAX_ZOOM,
): Transform {
  // Degenerate target or viewport: nothing to contain, leave the camera still.
  if (
    target.width <= 0 ||
    target.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return current;
  }

  const { scale, panX, panY } = current;

  // Project the target to screen space at the current transform.
  const left = target.x * scale + panX;
  const top = target.y * scale + panY;
  const right = (target.x + target.width) * scale + panX;
  const bottom = (target.y + target.height) * scale + panY;

  const contained =
    left >= 0 &&
    top >= 0 &&
    right <= viewport.width &&
    bottom <= viewport.height;
  if (contained) return current;

  // Zoom out just enough to fit the target when it no longer fits at the
  // current scale; never zoom in (that would move the camera on a contained
  // or shrinking extent).
  const fitScale = Math.min(
    viewport.width / target.width,
    viewport.height / target.height,
  );
  const nextScale =
    fitScale < scale ? Math.max(minZoom, Math.min(fitScale, maxZoom)) : scale;

  const nextPanX = clampPanAxis(
    panX,
    target.x,
    target.width,
    nextScale,
    viewport.width,
  );
  const nextPanY = clampPanAxis(
    panY,
    target.y,
    target.height,
    nextScale,
    viewport.height,
  );

  return { scale: nextScale, panX: nextPanX, panY: nextPanY };
}

// =============================================================================
// Canvas Layout Geometry (#3370)
// =============================================================================
//
// computeCanvasLayout is the one model of where RackCanvasView puts every rack.
// The renderer takes its rows and slot order from it; fit-all, focus-rack and
// ensure-visible take its rectangles. Slot sizes model the rendered DOM boxes
// (label display mode, annotations off), measured in Chromium against the CSS
// in RackDualView, BayedRackView and RackCanvasView.

/**
 * Extra height of a RackDualView box over one rack face: its padding
 * (2 x --space-3), the rack name line, the name margin and the column gap.
 */
const DUAL_VIEW_CHROME_HEIGHT = 72;

/** Horizontal padding of a RackDualView or BayedRackView box (2 x --space-3). */
const VIEW_PADDING_X = 24;

/** Width of the shared U-label column between adjacent bays. */
const U_LABELS_WIDTH = 32;

/**
 * Extra height of a BayedRackView box over its two stacked faces: padding,
 * the FRONT and REAR row labels, the bay labels and the column gaps.
 */
const BAYED_CHROME_HEIGHT = 153;

/** Additional BayedRackView height when the group has a name. */
const BAYED_NAME_HEIGHT = 46;

/**
 * Inset of a row group's members from its box edge: the 2px dashed border
 * plus --space-3 padding.
 */
const ROW_GROUP_INSET = 14;

/** Row group label line (--font-size-sm at line-height 1.5) plus --space-2. */
const ROW_GROUP_LABEL_BLOCK = 27.5;

/** Gap between the members of a row group (--space-4). */
const ROW_GROUP_MEMBER_GAP = 16;

/** Vertical gap between stacked canvas rows (--space-12). */
export const CANVAS_ROW_GAP = 48;

/** Horizontal gap between slots in a canvas row (--space-6). */
export const CANVAS_SLOT_GAP = RACK_GAP;

/** Padding around all rows, in canvas coordinates (--space-4). */
export const CANVAS_PADDING = RACK_ROW_PADDING;

/** A rack's box on the canvas, in canvas coordinates. */
export interface CanvasRackRect extends Bounds {
  id: string;
}

/**
 * One row slot: a standalone rack, a bayed group or a row group, with its
 * outer box (including group chrome) and one rectangle per member rack. A
 * bayed group's members share the group's box because they render as one
 * view; a row group's members each get their own box.
 */
export interface CanvasSlot extends Bounds {
  item: RackRowItem;
  racks: CanvasRackRect[];
}

/** One stacked canvas row. Its slots are bottom-aligned, left to right. */
export interface CanvasRow extends Bounds {
  /** Stable key: the group id for a group row, "standalone" otherwise. */
  key: string;
  slots: CanvasSlot[];
}

/** Every row on the canvas, top to bottom, and the box around all slots. */
export interface CanvasLayout {
  rows: CanvasRow[];
  bounds: Bounds;
}

/** Height of one rack face SVG with its name hidden. */
function faceHeight(rackHeight: number): number {
  return RACK_PADDING_HIDDEN + RAIL_WIDTH * 2 + rackHeight * U_HEIGHT_PX;
}

/** Size of a standalone RackDualView box (front, plus rear when shown). */
function dualViewSize(rack: Rack): { width: number; height: number } {
  const face = getRackWidth(rack.width);
  const faces = rack.show_rear ? face * 2 + DUAL_VIEW_GAP : face;
  return {
    width: VIEW_PADDING_X + faces,
    height: faceHeight(rack.height) + DUAL_VIEW_CHROME_HEIGHT,
  };
}

/** Size of a BayedRackView box: bays side by side, front row above rear. */
function bayedViewSize(
  group: RackGroup,
  members: Rack[],
): { width: number; height: number } {
  const bays = members.reduce((sum, r) => sum + getRackWidth(r.width), 0);
  const tallest = Math.max(...members.map((r) => r.height));
  return {
    width: VIEW_PADDING_X + bays + U_LABELS_WIDTH * (members.length - 1),
    height:
      faceHeight(tallest) * 2 +
      BAYED_CHROME_HEIGHT +
      (group.name ? BAYED_NAME_HEIGHT : 0),
  };
}

/**
 * Size a slot at the origin, with member rectangles relative to the slot's
 * top-left corner.
 */
function sizeSlot(item: RackRowItem): {
  width: number;
  height: number;
  racks: CanvasRackRect[];
} {
  if (item.kind === "rack") {
    const size = dualViewSize(item.rack);
    return { ...size, racks: [{ id: item.rack.id, x: 0, y: 0, ...size }] };
  }
  if (item.group.layout_preset === "bayed") {
    const size = bayedViewSize(item.group, item.racks);
    return {
      ...size,
      racks: item.racks.map((rack) => ({ id: rack.id, x: 0, y: 0, ...size })),
    };
  }
  const sizes = item.racks.map(dualViewSize);
  const tallest = Math.max(...sizes.map((s) => s.height));
  const top = ROW_GROUP_INSET + ROW_GROUP_LABEL_BLOCK;
  let x = ROW_GROUP_INSET;
  const racks = item.racks.map((rack, i) => {
    const size = sizes[i]!;
    const rect = { id: rack.id, x, y: top + tallest - size.height, ...size };
    x += size.width + ROW_GROUP_MEMBER_GAP;
    return rect;
  });
  return {
    width: x - ROW_GROUP_MEMBER_GAP + ROW_GROUP_INSET,
    height: top + tallest + ROW_GROUP_INSET,
    racks,
  };
}

/**
 * Lay the canvas out as stacked rows (#3370): the single source of geometry
 * for the renderer and the camera.
 *
 * Rows come from organizeRackRows (each group its own row, standalone racks
 * together). Rows stack from the top with CANVAS_ROW_GAP between them; slots
 * run left to right with CANVAS_SLOT_GAP and share a baseline, like racks on a
 * floor. Everything is in canvas coordinates, offset by CANVAS_PADDING.
 */
export function computeCanvasLayout(
  racks: Rack[],
  groups: RackGroup[] = [],
): CanvasLayout {
  const rows: CanvasRow[] = [];
  let y = CANVAS_PADDING;
  let maxRight = CANVAS_PADDING;

  for (const items of organizeRackRows(racks, groups)) {
    const sized = items.map((item) => ({ item, ...sizeSlot(item) }));
    const height = Math.max(...sized.map((s) => s.height));
    let x = CANVAS_PADDING;
    const slots = sized.map((s): CanvasSlot => {
      const slotY = y + height - s.height;
      const slot: CanvasSlot = {
        item: s.item,
        x,
        y: slotY,
        width: s.width,
        height: s.height,
        racks: s.racks.map((r) => ({ ...r, x: r.x + x, y: r.y + slotY })),
      };
      x += s.width + CANVAS_SLOT_GAP;
      return slot;
    });
    const width = x - CANVAS_SLOT_GAP - CANVAS_PADDING;
    const first = items[0]!;
    rows.push({
      key: first.kind === "group" ? `group:${first.group.id}` : "standalone",
      x: CANVAS_PADDING,
      y,
      width,
      height,
      slots,
    });
    maxRight = Math.max(maxRight, CANVAS_PADDING + width);
    y += height + CANVAS_ROW_GAP;
  }

  const bounds: Bounds =
    rows.length === 0
      ? { x: 0, y: 0, width: 0, height: 0 }
      : {
          x: CANVAS_PADDING,
          y: CANVAS_PADDING,
          width: maxRight - CANVAS_PADDING,
          height: y - CANVAS_ROW_GAP - CANVAS_PADDING,
        };
  return { rows, bounds };
}

/**
 * The outer box of every slot, including group chrome. Fit-all frames these.
 *
 * @param racks - Array of racks from the layout store
 * @param rackGroups - Array of rack groups
 */
export function racksToPositions(
  racks: Rack[],
  rackGroups: RackGroup[] = [],
): RackPosition[] {
  return computeCanvasLayout(racks, rackGroups).rows.flatMap((row) =>
    row.slots.map(({ x, y, width, height }) => ({ x, y, width, height })),
  );
}

/**
 * Focus targets: one box per standalone rack and per row-group member, and
 * one shared box per bayed group (listing every member id), because a bayed
 * group renders as a single view. focusRack and ensureRacksVisible map rack
 * ids back to these.
 *
 * @param racks - Array of racks from the layout store
 * @param rackGroups - Array of rack groups
 */
export function racksToPositionsWithIds(
  racks: Rack[],
  rackGroups: RackGroup[] = [],
): RackPositionWithIds[] {
  return computeCanvasLayout(racks, rackGroups).rows.flatMap((row) =>
    row.slots.flatMap((slot): RackPositionWithIds[] => {
      if (
        slot.item.kind === "group" &&
        slot.item.group.layout_preset === "bayed"
      ) {
        const { x, y, width, height } = slot;
        return [{ x, y, width, height, rackIds: slot.racks.map((r) => r.id) }];
      }
      return slot.racks.map(({ id, x, y, width, height }) => ({
        x,
        y,
        width,
        height,
        rackIds: [id],
      }));
    }),
  );
}
