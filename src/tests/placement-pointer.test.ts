import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the resolved drop target without a real SVG / geometry.
vi.mock("$lib/utils/rack-drop-coordinator", () => ({
  resolveDropTarget: vi.fn(),
}));
// Avoid touching navigator.vibrate on the invalid path.
vi.mock("$lib/utils/haptics", () => ({ hapticError: vi.fn() }));

import { handlePlacementClick } from "$lib/utils/rack-interaction-handlers";
import { resolveDropTarget } from "$lib/utils/rack-drop-coordinator";
import { hapticError } from "$lib/utils/haptics";

/** Build a minimal RackHandlerContext; only the getters used by placement matter. */
function makeCtx() {
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
    toastStore: {},
  } as unknown as Parameters<typeof handlePlacementClick>[2];
}

/** Minimal MouseEvent stand-in carrying just the client coordinates. */
function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as unknown as MouseEvent;
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

    // eslint-disable-next-line no-restricted-syntax -- a single click must place exactly once
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
});
