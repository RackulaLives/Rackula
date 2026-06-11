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

type PanzoomInstance = ReturnType<typeof panzoom>;

export interface CanvasPanzoomOptions {
  minZoom: number;
  maxZoom: number;
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
  const instance = panzoom(container, {
    minZoom,
    maxZoom,
    smoothScroll: false,
    // Disable default zoom on double-click (we handle zoom via toolbar)
    zoomDoubleClickSpeed: 1,
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

  debug.log("Panzoom initialized on container:", container);

  return instance;
}
