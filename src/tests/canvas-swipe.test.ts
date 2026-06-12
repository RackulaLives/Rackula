/**
 * Tests for the rack swipe controller (#1610)
 *
 * Covers the mobile swipe-to-switch-rack state machine extracted from
 * Canvas.svelte: when a single-finger horizontal flick switches the active
 * rack and when the gesture is rejected (not mobile, too few racks, placing,
 * multi-touch, or below the horizontal pan-lock threshold). The underlying
 * gesture math is covered in canvas-coordinates.test.ts and gestures.test.ts;
 * here we assert the controller's wiring to the store actions.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createRackSwipeController,
  type RackSwipeDeps,
  type RackSwipeController,
} from "$lib/utils/canvas-swipe.svelte";
import type { Rack } from "$lib/types";

let active: RackSwipeController | null = null;

afterEach(() => {
  active?.dispose();
  active = null;
});

function makeRacks(...ids: string[]): Rack[] {
  return ids.map((id) => ({ id })) as unknown as Rack[];
}

function makeController(overrides: Partial<RackSwipeDeps> = {}) {
  const deps: RackSwipeDeps = {
    isMobile: () => true,
    getRacks: () => makeRacks("r1", "r2"),
    getRackGroups: () => [],
    isPlacing: () => false,
    getActiveRackId: () => "r1",
    setActiveRack: vi.fn(),
    selectRack: vi.fn(),
    focusRack: vi.fn(),
    ...overrides,
  };
  const controller = createRackSwipeController(deps);
  active = controller;
  return { controller, deps };
}

function touchStart(x: number, y: number): TouchEvent {
  return { touches: [{ clientX: x, clientY: y }] } as unknown as TouchEvent;
}

function touchMove(x: number, y: number, fingers = 1): TouchEvent {
  const touches = fingers === 1 ? [{ clientX: x, clientY: y }] : [{}, {}];
  return { touches } as unknown as TouchEvent;
}

function touchEnd(x: number, y: number): TouchEvent {
  return {
    touches: [],
    changedTouches: [{ clientX: x, clientY: y }],
  } as unknown as TouchEvent;
}

/** Run a complete single-finger horizontal flick from startX to endX. */
function flick(controller: RackSwipeController, startX: number, endX: number) {
  controller.handleTouchStart(touchStart(startX, 100));
  controller.handleTouchMove(touchMove(endX, 100));
  controller.handleTouchEnd(touchEnd(endX, 100));
}

describe("rack swipe controller", () => {
  it("switches to the adjacent rack on a leftward flick past the threshold", () => {
    const { controller, deps } = makeController();
    flick(controller, 220, 120); // dx = -100: leftward "next"

    expect(deps.setActiveRack).toHaveBeenCalledWith("r2");
    expect(deps.selectRack).toHaveBeenCalledWith("r2");
    expect(deps.focusRack).toHaveBeenCalledTimes(1);
  });

  it("switches on a rightward flick (wraps to the other rack)", () => {
    const { controller, deps } = makeController();
    flick(controller, 120, 220); // dx = +100: rightward "previous", wraps r1 -> r2

    expect(deps.setActiveRack).toHaveBeenCalledWith("r2");
    expect(deps.selectRack).toHaveBeenCalledWith("r2");
  });

  it("ignores gestures when not on mobile", () => {
    const { controller, deps } = makeController({ isMobile: () => false });
    flick(controller, 220, 120);

    expect(deps.setActiveRack).not.toHaveBeenCalled();
  });

  it("ignores gestures with fewer than two racks", () => {
    const { controller, deps } = makeController({
      getRacks: () => makeRacks("only"),
    });
    flick(controller, 220, 120);

    expect(deps.setActiveRack).not.toHaveBeenCalled();
  });

  it("ignores gestures while placing a device", () => {
    const { controller, deps } = makeController({ isPlacing: () => true });
    flick(controller, 220, 120);

    expect(deps.setActiveRack).not.toHaveBeenCalled();
  });

  it("does not switch when the swipe stays below the horizontal pan lock", () => {
    const { controller, deps } = makeController();
    flick(controller, 200, 210); // dx = +10, under the 20px pan lock

    expect(deps.setActiveRack).not.toHaveBeenCalled();
  });

  it("does not switch when a second finger joins mid-gesture", () => {
    const { controller, deps } = makeController();
    controller.handleTouchStart(touchStart(220, 100));
    controller.handleTouchMove(touchMove(120, 100, 2)); // multi-touch
    controller.handleTouchEnd(touchEnd(120, 100));

    expect(deps.setActiveRack).not.toHaveBeenCalled();
  });

  it("resets the gesture on touch cancel so a later release does nothing", () => {
    const { controller, deps } = makeController();
    controller.handleTouchStart(touchStart(220, 100));
    controller.handleTouchCancel();
    controller.handleTouchEnd(touchEnd(120, 100));

    expect(deps.setActiveRack).not.toHaveBeenCalled();
  });
});
