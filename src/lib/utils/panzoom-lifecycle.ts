/**
 * Canvas panzoom lifecycle
 *
 * Owns panzoom instance construction with Rackula's wheel and mousedown
 * gating rules, extracted from Canvas.svelte (#1610) so the component only
 * keeps reactive wiring. Logging stays on the same debug channel as before.
 */
import panzoom from "panzoom";
import { debug } from "$lib/utils/debug";
import {
  shiftScrollPan,
  panBlockReason,
  type CanvasPointerTarget,
} from "$lib/utils/canvas-coordinates";
import { getPlacementStore } from "$lib/stores/placement.svelte";

type PanzoomInstance = ReturnType<typeof panzoom>;

export interface CanvasPanzoomOptions {
  minZoom: number;
  maxZoom: number;
}

/**
 * Minimum distance (in CSS pixels) a single-finger touch must travel before
 * the gesture is treated as a drag/pan rather than a tap. Below this,
 * touchmove events are swallowed so panzoom never fires panstart and a tap is
 * not misread as a micro-drag. This is the foundation for pinch-zoom and
 * two-finger pan (#2463), which build on top of this threshold.
 */
export const DRAG_THRESHOLD_PX = 8;

/**
 * Stateful drag-threshold gate for single-finger touch gestures on the canvas.
 *
 * Records the touchstart position on {@link onStart}, then {@link shouldBlock}
 * returns true for sub-threshold moves (the gesture looks like a tap) and
 * false once the threshold is exceeded (the gesture is a drag). Once exceeded,
 * all subsequent moves in the same gesture pass through so panzoom can pan
 * without per-frame re-evaluation. The gate resets on the next onStart.
 */
export function createTouchDragThreshold(thresholdPx = DRAG_THRESHOLD_PX) {
  let startX = 0;
  let startY = 0;
  let hasExceeded = false;

  return {
    onStart(x: number, y: number): void {
      startX = x;
      startY = y;
      hasExceeded = false;
    },
    shouldBlock(x: number, y: number): boolean {
      if (hasExceeded) return false;
      const distance = Math.hypot(x - startX, y - startY);
      if (distance >= thresholdPx) {
        hasExceeded = true;
        return false;
      }
      return true;
    },
    reset(): void {
      hasExceeded = false;
    },
  };
}

/**
 * Create the panzoom instance for the canvas container.
 *
 * Behaviour:
 * - Shift+scroll pans horizontally instead of zooming.
 * - Normal scroll zooms centered on the cursor (panzoom default).
 * - Mousedown on draggable elements or rack areas blocks panning so
 *   drag-drop and rack selection keep working; only the canvas background
 *   starts a pan.
 * - Double-click zoom is disabled (zoom is handled via the toolbar).
 *
 * The caller owns disposal (via the canvas store).
 */
export function createCanvasPanzoom(
  container: HTMLElement,
  { minZoom, maxZoom }: CanvasPanzoomOptions,
): PanzoomInstance {
  // Claim all touch gestures for the canvas so the browser does not intercept
  // pans or pinches with native scrolling/zooming. Panzoom handles panning,
  // and the drag-threshold listeners below disambiguate taps from micro-drags.
  // This is the foundation for pinch-zoom and two-finger pan (#2463).
  container.style.touchAction = "none";

  const threshold = createTouchDragThreshold();
  const placementStore = getPlacementStore();

  // Capture-phase touch listeners that implement the drag threshold. They fire
  // before panzoom's own touchstart (target phase) and document-level touchmove
  // (bubble phase), allowing us to swallow sub-threshold moves so panzoom never
  // fires panstart for a tap.
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    // While placing, the touch belongs to the rack (tap-to-place); panzoom's
    // onTouch hook also returns false so it does not claim the gesture.
    if (placementStore.isPlacing) return;
    const touch = e.touches[0];
    if (touch) threshold.onStart(touch.clientX, touch.clientY);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    // While placing, do not intercept: the touch passes through to the rack.
    if (placementStore.isPlacing) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (threshold.shouldBlock(touch.clientX, touch.clientY)) {
      // Sub-threshold movement: suppress panzoom panstart and browser scroll.
      e.preventDefault();
      e.stopPropagation();
    }
  };

  container.addEventListener("touchstart", onTouchStart, {
    capture: true,
    passive: true,
  });
  container.addEventListener("touchmove", onTouchMove, {
    capture: true,
    passive: false,
  });

  const instance = panzoom(container, {
    minZoom,
    maxZoom,
    smoothScroll: false,
    // Disable default zoom on double-click (we handle zoom via toolbar)
    zoomDoubleClickSpeed: 1,
    // While the place or move tool is active, let touch events pass through to
    // the rack SVG for tap-to-place. Returning false tells panzoom not to
    // preventDefault/stopPropagation, so the touch reaches the rack. An edit
    // gesture must not scroll the canvas.
    onTouch: (_e: TouchEvent) => {
      if (placementStore.isPlacing) return false;
      return true;
    },
    // Handle wheel events for zoom and Shift+scroll for horizontal pan
    beforeWheel: (e: WheelEvent) => {
      // Shift+scroll = horizontal pan instead of zoom
      if (e.shiftKey) {
        debug.log("beforeWheel: Shift+scroll, performing horizontal pan");
        // Panzoom doesn't do Shift+scroll pan, so we pan manually using the
        // vertical scroll delta as a horizontal pan amount
        const next = shiftScrollPan(instance.getTransform(), e.deltaY);
        instance.moveTo(next.x, next.y);
        if (e.cancelable) {
          e.preventDefault();
        }
        return true; // Tell panzoom to ignore this wheel event (we handled it)
      }
      // Normal scroll = zoom centered on cursor (panzoom default behavior)
      debug.log("beforeWheel: zoom at cursor position");
      return false; // Let panzoom handle zoom
    },
    // Allow panning only when not interacting with drag targets or racks
    beforeMouseDown: (e: MouseEvent) => {
      const reason = panBlockReason(e.target as CanvasPointerTarget | null);

      if (reason === "draggable") {
        debug.log("beforeMouseDown: blocking pan for draggable element");
        return true; // Block panning, let drag-drop work
      }

      if (reason === "rack-area") {
        debug.log("beforeMouseDown: blocking pan for rack area element");
        return true; // Block panning, let rack selection work
      }

      debug.log("beforeMouseDown: allowing pan on canvas background");
      return false;
    },
    // Filter out drag events from panzoom handling
    filterKey: () => true,
  });

  // Wrap dispose to clean up the threshold listeners alongside panzoom's own.
  const originalDispose = instance.dispose.bind(instance);
  instance.dispose = () => {
    container.removeEventListener("touchstart", onTouchStart, {
      capture: true,
    });
    container.removeEventListener("touchmove", onTouchMove, {
      capture: true,
    });
    originalDispose();
  };

  debug.log("Panzoom initialized on container:", container);

  return instance;
}
