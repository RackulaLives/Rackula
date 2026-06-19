/**
 * Canvas double-tap controller (#2463)
 *
 * Owns the mobile double-tap-to-fit gesture. Two quick single-finger taps in
 * roughly the same spot fire the fit callback; slow taps, taps that drift into
 * a drag, multi-touch (pinch), and placement mode are all rejected. The caller
 * wires the touch listeners to the canvas element and supplies the fit verb;
 * all gesture bookkeeping stays here.
 *
 * panzoom's own internal touch double-tap is neutralised (zoomDoubleClickSpeed
 * is 1 in panzoom-lifecycle.ts, a no-op multiplier), so this controller is the
 * single source of double-tap behaviour and does not fight the library.
 */
import { appDebug } from "$lib/utils/debug";

/** Max milliseconds between the two taps for them to count as a double-tap. */
export const DOUBLE_TAP_MAX_DELAY_MS = 300;

/**
 * Max distance (CSS px) a single tap may travel between touchstart and touchend
 * before it is treated as a drag, and the max distance allowed between the two
 * taps' start points before they are treated as two separate taps.
 */
export const DOUBLE_TAP_MAX_MOVE_PX = 30;

/**
 * Reactive data and actions the controller needs. Getters keep the controller
 * decoupled from the stores so it reads live values each time a gesture fires.
 */
export interface CanvasDoubleTapDeps {
  isMobile: () => boolean;
  isPlacing: () => boolean;
  /** Fit-to-screen verb, resolved from the shared action/canvas wiring. */
  onfit: () => void;
}

export interface CanvasDoubleTapController {
  handleTouchStart: (event: TouchEvent) => void;
  handleTouchEnd: (event: TouchEvent) => void;
  handleTouchCancel: () => void;
}

interface PendingTap {
  startX: number;
  startY: number;
  /** Timestamp of the touchend that completed the previous valid tap. */
  endTime: number;
}

export function createCanvasDoubleTap(
  deps: CanvasDoubleTapDeps,
): CanvasDoubleTapController {
  const mobileDebug = appDebug.mobile;

  // The in-flight tap's touchstart (null when no single-finger touch is down).
  let activeStart: { x: number; y: number } | null = null;
  // The last completed valid tap, used to match the next tap against.
  let lastTap: PendingTap | null = null;

  function eligible(): boolean {
    return deps.isMobile() && !deps.isPlacing();
  }

  function handleTouchStart(event: TouchEvent) {
    if (!eligible() || event.touches.length !== 1) {
      // Multi-touch or ineligible: abandon any pending tap so a pinch can never
      // complete a double-tap.
      activeStart = null;
      lastTap = null;
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      activeStart = null;
      return;
    }
    activeStart = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = activeStart;
    activeStart = null;
    if (!start || !eligible()) {
      lastTap = null;
      return;
    }
    // Still single-finger at release? (touches is the remaining set.)
    if (event.touches.length !== 0) {
      lastTap = null;
      return;
    }
    const changed = event.changedTouches[0];
    const endX = changed?.clientX ?? start.x;
    const endY = changed?.clientY ?? start.y;

    // A tap that drifted into a drag is a pan, not a tap.
    if (Math.hypot(endX - start.x, endY - start.y) > DOUBLE_TAP_MAX_MOVE_PX) {
      lastTap = null;
      return;
    }

    const now = Date.now();
    const previous = lastTap;
    if (
      previous &&
      now - previous.endTime <= DOUBLE_TAP_MAX_DELAY_MS &&
      Math.hypot(start.x - previous.startX, start.y - previous.startY) <=
        DOUBLE_TAP_MAX_MOVE_PX
    ) {
      // Second tap matched the first: fit, and consume the pair so a third tap
      // starts a fresh sequence.
      lastTap = null;
      if (mobileDebug.enabled) {
        mobileDebug("double-tap detected: fit");
      }
      deps.onfit();
      return;
    }

    // First tap (or the pair did not match): record this tap as the candidate.
    lastTap = { startX: start.x, startY: start.y, endTime: now };
  }

  function handleTouchCancel() {
    activeStart = null;
    lastTap = null;
  }

  return {
    handleTouchStart,
    handleTouchEnd,
    handleTouchCancel,
  };
}
