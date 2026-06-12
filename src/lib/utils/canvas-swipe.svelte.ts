/**
 * Rack swipe controller
 *
 * Owns the mobile swipe-to-switch-rack gesture state machine extracted from
 * Canvas.svelte (#1610). It tracks a single-finger horizontal swipe,
 * classifies it, and switches the active rack with a brief slide animation.
 * The caller wires the touch listeners to the canvas element and reads
 * `animationDirection` for the CSS class; all gesture bookkeeping stays here.
 */
import {
  classifyRackSwipeGesture,
  type RackSwipeDirection,
} from "$lib/utils/gestures";
import {
  resolveSwipeTargetRackId,
  exceedsHorizontalPanLock,
} from "$lib/utils/canvas-coordinates";
import { appDebug } from "$lib/utils/debug";
import type { Rack, RackGroup } from "$lib/types";

const SWIPE_SWITCH_ANIMATION_MS = 200;
const TOUCH_MOVE_LOG_INTERVAL_MS = 120;

interface SwipeGestureState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  isMultiTouch: boolean;
}

/**
 * Reactive data and actions the controller needs. Getters keep the controller
 * decoupled from the stores' reactive internals so it reads live values each
 * time a gesture is evaluated.
 */
export interface RackSwipeDeps {
  isMobile: () => boolean;
  getRacks: () => Rack[];
  getRackGroups: () => RackGroup[];
  isPlacing: () => boolean;
  getActiveRackId: () => string | null;
  setActiveRack: (id: string) => void;
  selectRack: (id: string) => void;
  focusRack: (
    rackIds: string[],
    racks: Rack[],
    rackGroups: RackGroup[],
    rightOffset: number,
  ) => void;
}

export interface RackSwipeController {
  /** Animation class direction for the current switch, or null when idle. */
  readonly animationDirection: RackSwipeDirection | null;
  handleTouchStart: (event: TouchEvent) => void;
  handleTouchMove: (event: TouchEvent) => void;
  handleTouchEnd: (event: TouchEvent) => void;
  handleTouchCancel: () => void;
  /** Clear any pending animation timer. Call from the host's onDestroy. */
  dispose: () => void;
}

export function createRackSwipeController(
  deps: RackSwipeDeps,
): RackSwipeController {
  const mobileDebug = appDebug.mobile;

  let swipeGesture: SwipeGestureState | null = null;
  let animationDirection = $state<RackSwipeDirection | null>(null);
  let animationTimeout: ReturnType<typeof setTimeout> | null = null;
  let animationEpoch = 0;
  let lastTouchMoveLogAt = 0;

  function triggerSwipeAnimation(direction: RackSwipeDirection) {
    if (animationTimeout) {
      clearTimeout(animationTimeout);
      animationTimeout = null;
    }

    const epoch = ++animationEpoch;
    animationDirection = null;

    // Restart the animation on the next microtask so consecutive swipes
    // re-trigger the CSS keyframes instead of being deduped by Svelte.
    Promise.resolve().then(() => {
      if (epoch !== animationEpoch) return;

      animationDirection = direction;
      animationTimeout = setTimeout(() => {
        if (epoch !== animationEpoch) return;
        animationDirection = null;
        animationTimeout = null;
      }, SWIPE_SWITCH_ANIMATION_MS);
    });
  }

  function switchRackFromSwipe(direction: RackSwipeDirection) {
    const racks = deps.getRacks();
    if (!deps.isMobile() || racks.length < 2) {
      return;
    }

    const targetRackId = resolveSwipeTargetRackId(
      racks.map((rack) => rack.id),
      deps.getActiveRackId(),
      direction,
    );
    if (!targetRackId) {
      return;
    }

    triggerSwipeAnimation(direction);
    deps.setActiveRack(targetRackId);
    deps.selectRack(targetRackId);
    deps.focusRack([targetRackId], racks, deps.getRackGroups(), 0);
  }

  function handleTouchStart(event: TouchEvent) {
    if (
      !deps.isMobile() ||
      deps.getRacks().length < 2 ||
      deps.isPlacing() ||
      event.touches.length !== 1
    ) {
      swipeGesture = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      swipeGesture = null;
      return;
    }

    swipeGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startTime: performance.now(),
      isMultiTouch: false,
    };
    lastTouchMoveLogAt = 0;
    if (mobileDebug.enabled) {
      mobileDebug(
        "canvas touchstart: x=%d y=%d",
        swipeGesture.startX,
        swipeGesture.startY,
      );
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (!swipeGesture) return;

    if (event.touches.length !== 1) {
      swipeGesture.isMultiTouch = true;
      if (mobileDebug.enabled) {
        mobileDebug("canvas touchmove: multitouch detected");
      }
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;

    swipeGesture.currentX = touch.clientX;
    swipeGesture.currentY = touch.clientY;
    if (mobileDebug.enabled) {
      const now = performance.now();
      if (now - lastTouchMoveLogAt >= TOUCH_MOVE_LOG_INTERVAL_MS) {
        mobileDebug(
          "canvas touchmove: x=%d y=%d",
          swipeGesture.currentX,
          swipeGesture.currentY,
        );
        lastTouchMoveLogAt = now;
      }
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!swipeGesture) return;

    const changedTouch = event.changedTouches[0];
    const endX = changedTouch?.clientX ?? swipeGesture.currentX;
    const endY = changedTouch?.clientY ?? swipeGesture.currentY;
    const durationMs = performance.now() - swipeGesture.startTime;
    const horizontalLock = exceedsHorizontalPanLock(swipeGesture.startX, endX);

    if (!horizontalLock) {
      if (mobileDebug.enabled) {
        mobileDebug("canvas touchend: below horizontal lock threshold");
      }
      swipeGesture = null;
      return;
    }

    const direction = classifyRackSwipeGesture({
      startX: swipeGesture.startX,
      startY: swipeGesture.startY,
      endX,
      endY,
      durationMs,
      isMultiTouch: swipeGesture.isMultiTouch,
    });

    if (mobileDebug.enabled) {
      mobileDebug(
        "canvas touchend: direction=%s duration=%dms",
        direction ?? "none",
        Math.round(durationMs),
      );
    }

    swipeGesture = null;

    if (!direction) return;
    if (mobileDebug.enabled) {
      mobileDebug("Swipe detected: %s, switching rack", direction);
    }
    switchRackFromSwipe(direction);
  }

  function handleTouchCancel() {
    if (mobileDebug.enabled) {
      mobileDebug("canvas touchcancel: gesture reset");
    }
    swipeGesture = null;
  }

  return {
    get animationDirection() {
      return animationDirection;
    },
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    dispose() {
      // Invalidate any microtask still queued by triggerSwipeAnimation so it
      // no-ops on its epoch guard instead of writing state or scheduling a new
      // timer after teardown.
      animationEpoch++;
      if (animationTimeout) {
        clearTimeout(animationTimeout);
        animationTimeout = null;
      }
      swipeGesture = null;
    },
  };
}
