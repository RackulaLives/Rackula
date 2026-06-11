/**
 * Canvas coordinate math
 *
 * Pure pan/zoom and swipe-navigation math extracted from Canvas.svelte
 * (#1610) so it can be unit tested in isolation. Callers log via the
 * rackula:canvas:* debug namespaces; this module performs no side effects.
 */
import {
  RACK_SWIPE_PAN_THRESHOLD,
  type RackSwipeDirection,
} from "$lib/utils/gestures";

/** A panzoom translation offset in screen pixels. */
export interface PanPosition {
  x: number;
  y: number;
}

/**
 * Compute the pan position for Shift+scroll horizontal panning.
 * The vertical wheel delta becomes a horizontal pan: scrolling down pans
 * left, scrolling up pans right. Fractional trackpad deltas are preserved.
 */
export function shiftScrollPan(
  current: PanPosition,
  deltaY: number,
): PanPosition {
  return { x: current.x - deltaY, y: current.y };
}

/**
 * Resolve which rack a swipe gesture should activate.
 * Wraps around at both ends of the rack list. When no rack is active (or the
 * active id is unknown), "next" starts at the first rack and "previous" at
 * the last. Returns null when there are fewer than two racks or the target
 * is already active.
 */
export function resolveSwipeTargetRackId(
  rackIds: readonly string[],
  activeRackId: string | null,
  direction: RackSwipeDirection,
): string | null {
  if (rackIds.length < 2) return null;

  const currentIndex = activeRackId ? rackIds.indexOf(activeRackId) : -1;

  let nextIndex: number;
  if (currentIndex === -1) {
    nextIndex = direction === "next" ? 0 : rackIds.length - 1;
  } else {
    const delta = direction === "next" ? 1 : -1;
    nextIndex = (currentIndex + delta + rackIds.length) % rackIds.length;
  }

  const targetId = rackIds[nextIndex];
  if (!targetId || targetId === activeRackId) return null;
  return targetId;
}

/**
 * Whether a touch gesture moved far enough horizontally to count as a swipe
 * rather than a pan. Strictly greater than the threshold, matching the
 * original Canvas.svelte horizontal-lock check.
 */
export function exceedsHorizontalPanLock(
  startX: number,
  endX: number,
  threshold: number = RACK_SWIPE_PAN_THRESHOLD,
): boolean {
  return Math.abs(endX - startX) > threshold;
}

/**
 * Structural view of a pointer event target. Element and HTMLElement satisfy
 * this, and tests can pass plain stubs without touching the DOM.
 */
export interface CanvasPointerTarget {
  draggable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
}

export type PanBlockReason = "draggable" | "rack-area" | null;

/**
 * Classify a mousedown target for panzoom's beforeMouseDown gate.
 *
 * Priority 1: draggable elements (device drag-drop) block panning.
 * For SVGElements the draggable property is absent, so the attribute and a
 * draggable ancestor are also checked.
 * Priority 2: anywhere within a rack area blocks panning so clicks select
 * the rack instead.
 * Otherwise panning is allowed on the canvas background.
 */
export function panBlockReason(
  target: CanvasPointerTarget | null,
): PanBlockReason {
  if (!target) return null;

  const isDraggableElement =
    target.draggable === true ||
    target.getAttribute?.("draggable") === "true" ||
    (target.closest?.('[draggable="true"]') ?? null) !== null;

  if (isDraggableElement) return "draggable";

  const isWithinRack =
    (target.closest?.(".rack-dual-view, .bayed-rack-view") ?? null) !== null;
  if (isWithinRack) return "rack-area";

  return null;
}

/**
 * Whether a long-press target sits inside a rendered rack (device, rack
 * container, or bayed view). Used to suppress the canvas context menu when
 * the press belongs to a rack interaction.
 */
export function isRackInteractionTarget(
  target: CanvasPointerTarget | null,
): boolean {
  if (!target) return false;
  return Boolean(
    target.closest?.(
      ".rack-device, .rack-container, .rack-wrapper, .rack-dual-view, .bayed-rack-view",
    ),
  );
}
