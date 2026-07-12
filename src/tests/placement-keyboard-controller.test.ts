/**
 * Regression test for #2990: keyboard placement onto a full rack surfaced the
 * "no room" outcome only through an aria-live announcement, leaving sighted
 * users with no visible cue while the full rack was highlighted as though it
 * were a valid target. The drag path already shows a "No room for this
 * device here" toast (rack-drop-handlers.ts); the keyboard path should show
 * the same one.
 */
import { describe, it, expect, vi } from "vitest";
import { createPlacementKeyboardController } from "$lib/utils/placement-keyboard-controller";
import {
  createTestDeviceType,
  createTestDevice,
  createTestRack,
} from "./factories";

describe("keyboard placement controller — full rack no-room toast (#2990)", () => {
  it("shows the 'No room for this device here' toast when Enter is pressed on a full rack", () => {
    const pendingDevice = createTestDeviceType({
      slug: "test-device",
      u_height: 1,
    });
    const occupant = createTestDeviceType({
      slug: "occupant-device",
      u_height: 1,
    });
    const rack = createTestRack({
      id: "rack-1",
      name: "Rack 1",
      height: 1,
      devices: [createTestDevice({ device_type: occupant.slug, position: 1 })],
    });

    const announce = vi.fn();
    const showToast = vi.fn();

    const controller = createPlacementKeyboardController({
      getRacks: () => [rack],
      getDeviceLibrary: () => [pendingDevice, occupant],
      getActiveRackId: () => rack.id,
      isPlacing: () => true,
      getPendingDevice: () => pendingDevice,
      getTargetFace: () => "front",
      getCursorPosition: () => null,
      setActiveRack: vi.fn(),
      setCursor: vi.fn(),
      announce,
      cancelPlacement: vi.fn(),
      abandonPlacement: vi.fn(),
      placeDevice: vi.fn(() => false),
      completePlacement: vi.fn(),
      showToast,
    });

    const consumed = controller.handleKeyDown(
      new KeyboardEvent("keydown", { key: "Enter" }),
    );

    expect(consumed).toBe(true);
    expect(announce).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("No room for this device here");
  });
});
