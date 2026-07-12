/**
 * Regression test for #2990: tapping/clicking an occupied slot while a device
 * was armed for placement also ran the ordinary device-select handler on the
 * same gesture, selecting the occupying device and opening its edit panel
 * while the "Placing" banner stayed armed. Placement mode should be the sole
 * focus of the interaction: a pointer tap on a device while placing must not
 * select it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import { createTestDeviceType } from "./factories";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";

function tapHitbox(hitbox: Element) {
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
}

describe("RackDevice placement-mode select suppression (#2990)", () => {
  afterEach(() => {
    resetPlacementStore();
  });

  it("does not select the device on a pointer tap while placement mode is armed", () => {
    const device = createTestDeviceType({ slug: "test-server", u_height: 1 });
    const onselect = vi.fn();

    getPlacementStore().startPlacement(device);

    const { getByTestId } = render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        onselect,
      },
    });

    tapHitbox(getByTestId("rack-device-hitbox"));

    expect(onselect).not.toHaveBeenCalled();
  });

  it("selects the device on a pointer tap when placement mode is not armed", () => {
    const device = createTestDeviceType({ slug: "test-server", u_height: 1 });
    const onselect = vi.fn();

    const { getByTestId } = render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        onselect,
      },
    });

    tapHitbox(getByTestId("rack-device-hitbox"));

    expect(onselect).toHaveBeenCalledTimes(1);
  });
});
