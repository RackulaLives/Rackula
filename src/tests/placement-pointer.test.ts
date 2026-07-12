import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the resolved drop target without a real SVG / geometry.
vi.mock("$lib/utils/rack-drop-coordinator", () => ({
  resolveDropTarget: vi.fn(),
}));
// Avoid touching navigator.vibrate on the invalid path.
vi.mock("$lib/utils/haptics", () => ({ hapticError: vi.fn() }));

import {
  handlePlacementClick,
  handleTouchEnd,
} from "$lib/utils/rack-interaction-handlers";
import { resolveDropTarget } from "$lib/utils/rack-drop-coordinator";
import { hapticError } from "$lib/utils/haptics";

/** Build a minimal RackHandlerContext; only the getters used by placement matter. */
function makeCtx(showToast: ReturnType<typeof vi.fn> = vi.fn()) {
  return {
    getRack: () => ({}),
    getDeviceLibrary: () => [],
    getRackDims: () => ({}),
    getFaceFilter: () => "front",
    getSelectedDeviceId: () => null,
    getEventCallbacks: () => ({}),
    setDropPreview: () => {},
    setContainerHoverInfo: () => {},
    layoutStore: {},
    toastStore: { showToast },
  } as unknown as Parameters<typeof handlePlacementClick>[2];
}

/** Minimal MouseEvent stand-in carrying just the client coordinates. */
function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as unknown as MouseEvent;
}

/**
 * Minimal TouchEvent stand-in: a single changed touch at the given coordinates,
 * plus a spy preventDefault and a currentTarget stand-in for the rack <svg>.
 */
function makeTouchEvent(clientX: number, clientY: number) {
  const preventDefault = vi.fn();
  const event = {
    preventDefault,
    currentTarget: {} as SVGSVGElement,
    changedTouches: [{ clientX, clientY }],
  } as unknown as TouchEvent;
  return { event, preventDefault };
}

// Stands in for the rack <svg>; the mocked resolver ignores it.
const svg = {} as unknown as SVGSVGElement;
const device = { slug: "test-device", slot_width: 2 } as never;

describe("handlePlacementClick — mouse/pointer tap-to-place (#1757)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches a placement tap at the resolved U for a valid mouse click", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "valid",
      targetU: 7,
    });
    const onplacementtap = vi.fn();

    handlePlacementClick(
      makeMouseEvent(120, 240),
      svg,
      makeCtx(),
      device,
      onplacementtap,
    );

    // a single click must place exactly once
    expect(onplacementtap).toHaveBeenCalledTimes(1);
    expect(onplacementtap.mock.calls[0][0].detail).toEqual({
      position: 7,
      face: "front",
    });
  });

  it("does not place (and signals an error) when the target is invalid", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "invalid",
      targetU: 3,
    });
    const onplacementtap = vi.fn();

    handlePlacementClick(
      makeMouseEvent(0, 0),
      svg,
      makeCtx(),
      device,
      onplacementtap,
    );

    expect(onplacementtap).not.toHaveBeenCalled();
    expect(hapticError).toHaveBeenCalled();
  });

  it("shows the 'Can't place device here' toast when the target is occupied (#2990)", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "blocked",
      targetU: 3,
    });
    const showToast = vi.fn();
    const onplacementtap = vi.fn();

    handlePlacementClick(
      makeMouseEvent(0, 0),
      svg,
      makeCtx(showToast),
      device,
      onplacementtap,
    );

    expect(showToast).toHaveBeenCalledWith(
      "Can't place device here",
      "warning",
      3000,
    );
  });
});

describe("handleTouchEnd — touch tap-to-place (#2454)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dispatches a placement tap at the resolved U for a valid touch", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "valid",
      targetU: 4,
    });
    const onplacementtap = vi.fn();
    const { event, preventDefault } = makeTouchEvent(100, 200);

    handleTouchEnd(event, makeCtx(), device, onplacementtap);

    // The synthesised click that follows a tap must be suppressed so placement
    // does not double-fire on touchscreens.
    expect(preventDefault).toHaveBeenCalled();
    // a single tap must place exactly once
    expect(onplacementtap).toHaveBeenCalledTimes(1);
    expect(onplacementtap.mock.calls[0][0].detail).toEqual({
      position: 4,
      face: "front",
    });
  });

  it("does not place (and signals an error) when the touch target is invalid", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "invalid",
      targetU: 2,
    });
    const onplacementtap = vi.fn();
    const { event } = makeTouchEvent(0, 0);

    handleTouchEnd(event, makeCtx(), device, onplacementtap);

    expect(onplacementtap).not.toHaveBeenCalled();
    expect(hapticError).toHaveBeenCalled();
  });

  it("shows the 'Can't place device here' toast when the touch target is occupied (#2990)", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "blocked",
      targetU: 2,
    });
    const showToast = vi.fn();
    const onplacementtap = vi.fn();
    const { event } = makeTouchEvent(0, 0);

    handleTouchEnd(event, makeCtx(showToast), device, onplacementtap);

    expect(showToast).toHaveBeenCalledWith(
      "Can't place device here",
      "warning",
      3000,
    );
  });

  it("ignores a touchend with no changed touch (no placement, no throw)", () => {
    (resolveDropTarget as ReturnType<typeof vi.fn>).mockReturnValue({
      feedback: "valid",
      targetU: 4,
    });
    const onplacementtap = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      currentTarget: {} as SVGSVGElement,
      changedTouches: [],
    } as unknown as TouchEvent;

    handleTouchEnd(event, makeCtx(), device, onplacementtap);

    expect(onplacementtap).not.toHaveBeenCalled();
  });
});
