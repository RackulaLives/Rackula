/**
 * Regression test for the #2990 follow-up: RackDevice suppresses onselect
 * while placement mode is armed (#2990/#3013), but the same gesture also
 * unconditionally calls event.stopPropagation() (both on the pointerup
 * handler and on the wrapping <g>'s onclick), so the click never reaches
 * Rack.svelte's rack-level handleClick -> handlePlacementClick path. Net
 * effect: clicking directly on an occupying device's body while placement is
 * armed was a total no-op - no "Can't place device here" toast, no
 * selection, banner stays armed.
 *
 * Unlike placement-pointer.test.ts (which calls handlePlacementClick
 * directly with synthetic coordinates) and
 * RackDevice.placement-select-suppression.test.ts (which renders RackDevice
 * in isolation, with no Rack parent to receive a routed click), this test
 * renders the real Rack -> RackDevice tree and dispatches a real bubbling
 * pointerdown/pointerup/click gesture on the device's hitbox element, so it
 * exercises the actual DOM event-routing path end to end.
 *
 * resolveDropTarget is mocked because JSDOM/happy-dom's SVGSVGElement
 * doesn't lay out real geometry (getBoundingClientRect() is always zero),
 * so pixel-accurate collision math isn't meaningful here; the routing bug
 * this guards is about whether the click reaches the handler at all, not
 * about geometry resolution (already covered by placement-pointer.test.ts).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import Rack from "$lib/components/Rack.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { resolveDropTarget } from "$lib/utils/rack-drop-coordinator";

vi.mock("$lib/utils/rack-drop-coordinator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/utils/rack-drop-coordinator")>();
  return { ...actual, resolveDropTarget: vi.fn() };
});

function clickHitbox(hitbox: Element) {
  hitbox.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    }),
  );
  hitbox.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    }),
  );
  // JSDOM/happy-dom does not synthesise a click from pointerdown+pointerup;
  // dispatch it explicitly to reproduce the real browser gesture.
  hitbox.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX: 0, clientY: 0 }),
  );
}

describe("Placement-mode click routing on an occupied device body (#2990 follow-up)", () => {
  afterEach(() => {
    resetPlacementStore();
    resetToastStore();
    vi.clearAllMocks();
  });

  it("shows the 'Can't place device here' toast and does not select the occupying device", () => {
    const deviceType = createTestDeviceType({
      slug: "test-server",
      u_height: 1,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({
          device_type: "test-server",
          position: 10,
          face: "front",
        }),
      ],
    });

    vi.mocked(resolveDropTarget).mockReturnValue({
      feedback: "blocked",
      targetU: 10,
      xOffsetInRack: 0,
    });

    getPlacementStore().startPlacement(deviceType);

    const ondeviceselect = vi.fn();

    const { getByTestId } = render(Rack, {
      props: {
        rack,
        deviceLibrary: [deviceType],
        selected: false,
        faceFilter: "front",
        ondeviceselect,
      },
    });

    clickHitbox(getByTestId("rack-device-hitbox"));

    expect(ondeviceselect).not.toHaveBeenCalled();
    expect(
      getToastStore().toasts.some(
        (t) => t.message === "Can't place device here",
      ),
    ).toBe(true);
    // Placement stays armed for a retry, matching the drag path (#2990).
    expect(getPlacementStore().isPlacing).toBe(true);
  });
});
