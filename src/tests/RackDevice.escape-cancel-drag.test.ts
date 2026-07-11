/**
 * Regression test for #2935: an in-progress device drag reset only on a
 * browser-issued pointercancel, drop, or pointerup. Pressing Escape mid-drag
 * had no handler and could not abort it. This asserts Escape aborts an active
 * device drag and clears the shared drag/tooltip state, mirroring the
 * pointercancel reset path.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import { createTestDeviceType } from "./factories";
import { getCurrentDragData } from "$lib/utils/dragdrop";
import {
  getDragTooltipState,
  hideDragTooltip,
} from "$lib/stores/dragTooltip.svelte";

describe("RackDevice Escape-to-cancel drag (#2935)", () => {
  afterEach(() => {
    // The tooltip store is a module-level singleton; clear it so a failed
    // assertion in one test cannot leak visible state into the next.
    hideDragTooltip();
  });

  it("aborts an active device drag and clears shared drag/tooltip state", async () => {
    const device = createTestDeviceType({
      slug: "test-server",
      u_height: 1,
    });
    const ondragend = vi.fn();

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
        ondragend,
      },
    });

    const hitbox = getByTestId("rack-device-hitbox");

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
      new PointerEvent("pointermove", {
        bubbles: true,
        isPrimary: true,
        pointerId: 1,
        clientX: 20,
        clientY: 20,
      }),
    );
    await tick();

    // Precondition: the move crossed the drag threshold and the shared drag
    // state reflects an active drag.
    expect(getCurrentDragData()).not.toBeNull();
    expect(getDragTooltipState().visible).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await tick();

    expect(getCurrentDragData()).toBeNull();
    expect(getDragTooltipState().visible).toBe(false);
    expect(ondragend).toHaveBeenCalledTimes(1);
  });

  it("does nothing when Escape is pressed while no drag is active", async () => {
    const device = createTestDeviceType({
      slug: "test-server",
      u_height: 1,
    });
    const ondragend = vi.fn();

    render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        ondragend,
      },
    });

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await tick();

    expect(ondragend).not.toHaveBeenCalled();
  });
});
