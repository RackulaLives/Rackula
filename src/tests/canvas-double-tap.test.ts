/**
 * Tests for the canvas double-tap controller (#2463)
 *
 * Covers the mobile double-tap-to-fit gesture: two quick single-finger taps in
 * roughly the same spot fire the fit callback, while slow taps, taps that drift
 * into a drag, multi-touch, and placement mode are all rejected. The controller
 * mirrors the rack swipe controller's shape (host wires touch listeners, the
 * controller owns the timing/position bookkeeping).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createCanvasDoubleTap,
  DOUBLE_TAP_MAX_DELAY_MS,
  DOUBLE_TAP_MAX_MOVE_PX,
  type CanvasDoubleTapDeps,
} from "$lib/utils/canvas-double-tap.svelte";

afterEach(() => {
  vi.useRealTimers();
});

function makeController(overrides: Partial<CanvasDoubleTapDeps> = {}) {
  const deps: CanvasDoubleTapDeps = {
    isMobile: () => true,
    isPlacing: () => false,
    onfit: vi.fn(),
    ...overrides,
  };
  return { controller: createCanvasDoubleTap(deps), deps };
}

function touchStart(x: number, y: number, fingers = 1): TouchEvent {
  const touches =
    fingers === 1
      ? [{ clientX: x, clientY: y }]
      : [{ clientX: x, clientY: y }, {}];
  return { touches } as unknown as TouchEvent;
}

function touchEnd(x: number, y: number): TouchEvent {
  return {
    touches: [],
    changedTouches: [{ clientX: x, clientY: y }],
  } as unknown as TouchEvent;
}

/** A single quick tap (down then up in the same spot) at time `at`. */
function tap(
  controller: ReturnType<typeof createCanvasDoubleTap>,
  x: number,
  y: number,
) {
  controller.handleTouchStart(touchStart(x, y));
  controller.handleTouchEnd(touchEnd(x, y));
}

describe("canvas double-tap controller", () => {
  it("fires fit on two quick taps in the same spot", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    tap(controller, 100, 100);
    vi.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS - 50);
    tap(controller, 102, 101);

    expect(deps.onfit).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the second tap is too late", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    tap(controller, 100, 100);
    vi.advanceTimersByTime(DOUBLE_TAP_MAX_DELAY_MS + 50);
    tap(controller, 100, 100);

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("does not fire when the second tap lands too far away", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    tap(controller, 100, 100);
    vi.advanceTimersByTime(50);
    tap(controller, 100 + DOUBLE_TAP_MAX_MOVE_PX + 10, 100);

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("does not treat a single tap as a double-tap", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    tap(controller, 100, 100);

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("rejects a tap that drifts into a drag between down and up", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    // First clean tap.
    tap(controller, 100, 100);
    vi.advanceTimersByTime(50);
    // Second touch moves far before release: it is a pan, not a tap.
    controller.handleTouchStart(touchStart(100, 100));
    controller.handleTouchEnd(touchEnd(100 + DOUBLE_TAP_MAX_MOVE_PX + 20, 100));

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("ignores multi-touch (pinch) gestures", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    controller.handleTouchStart(touchStart(100, 100, 2));
    controller.handleTouchEnd(touchEnd(100, 100));
    vi.advanceTimersByTime(50);
    controller.handleTouchStart(touchStart(100, 100, 2));
    controller.handleTouchEnd(touchEnd(100, 100));

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("does nothing when not on mobile", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController({ isMobile: () => false });

    tap(controller, 100, 100);
    vi.advanceTimersByTime(50);
    tap(controller, 100, 100);

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("does nothing while placing a device", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController({ isPlacing: () => true });

    tap(controller, 100, 100);
    vi.advanceTimersByTime(50);
    tap(controller, 100, 100);

    expect(deps.onfit).not.toHaveBeenCalled();
  });

  it("requires two fresh taps: a third tap does not double-fire off the second", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    tap(controller, 100, 100);
    vi.advanceTimersByTime(50);
    tap(controller, 100, 100); // fires (taps 1+2)
    vi.advanceTimersByTime(50);
    tap(controller, 100, 100); // tap 3 must NOT re-fire off the consumed tap 2

    expect(deps.onfit).toHaveBeenCalledTimes(1);
  });

  it("resets pending tap on touch cancel", () => {
    vi.useFakeTimers();
    const { controller, deps } = makeController();

    controller.handleTouchStart(touchStart(100, 100));
    controller.handleTouchCancel();
    vi.advanceTimersByTime(50);
    tap(controller, 100, 100);

    expect(deps.onfit).not.toHaveBeenCalled();
  });
});
