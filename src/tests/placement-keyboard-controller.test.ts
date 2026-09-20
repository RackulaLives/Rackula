/**
 * Regression test for #2990: keyboard placement onto a full rack surfaced the
 * "no room" outcome only through an aria-live announcement, leaving sighted
 * users with no visible cue while the full rack was highlighted as though it
 * were a valid target. The drag path already shows a "No room for this
 * device here" toast (rack-drop-handlers.ts); the keyboard path should show
 * the same one.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createPlacementKeyboardController,
  primeKeyboardPlacement,
} from "$lib/utils/placement-keyboard-controller";
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

describe("keyboard placement controller: no rail target in the rack (#3310)", () => {
  /**
   * A 300 mm device: a custom split carries it in a 19 inch rack (451 mm of
   * opening) but nothing can in a 10 inch one (222 mm), so the layout still
   * holds a rack the device cannot use.
   */
  const measured = createTestDeviceType({
    slug: "mini-pc",
    model: "Mini PC",
    u_height: 1,
    width_mm: 300,
  });

  function racks() {
    return [
      createTestRack({ id: "rack-19", name: "Rack A", height: 10, width: 19 }),
      createTestRack({ id: "rack-10", name: "Rack B", height: 10, width: 10 }),
    ];
  }

  function controllerFor(
    activeRackId: string,
    announce: () => void,
    showToast?: () => void,
  ) {
    return createPlacementKeyboardController({
      getRacks: racks,
      getDeviceLibrary: () => [measured],
      getActiveRackId: () => activeRackId,
      isPlacing: () => true,
      getPendingDevice: () => measured,
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
  }

  it("states the width requirement when Tab reaches a rack the device cannot use", () => {
    const announce = vi.fn();

    controllerFor("rack-19", announce).handleKeyDown(
      new KeyboardEvent("keydown", { key: "Tab" }),
    );

    // "No space in Rack B" would send the user hunting for a free U that cannot
    // exist, because the device has no rail target in a 10 inch rack at all.
    const said = announce.mock.calls.at(-1)?.[0] as string;
    expect(said).toContain("shelf");
    expect(said).not.toContain("No space");
  });

  it("stays armed when a wider rack in the layout can take the device", () => {
    const announce = vi.fn();
    const abandonPlacement = vi.fn();
    const setCursor = vi.fn();

    primeKeyboardPlacement(
      {
        getRacks: racks,
        getDeviceLibrary: () => [measured],
        getActiveRackId: () => "rack-10",
        getTargetFace: () => "front",
        setActiveRack: vi.fn(),
        setCursor,
        announce,
        abandonPlacement,
      },
      measured,
    );

    // Abandoning here would strand the user on the 10 inch rack with no way to
    // Tab to the 19 inch one that can take the device.
    expect(abandonPlacement).not.toHaveBeenCalled();
    expect(setCursor).toHaveBeenCalledWith("rack-10", null);
    expect(announce.mock.calls.at(-1)?.[0] as string).toContain("shelf");
  });

  it("abandons placement when no rack in the layout can take the device", () => {
    const announce = vi.fn();
    const abandonPlacement = vi.fn();

    primeKeyboardPlacement(
      {
        getRacks: () => [
          createTestRack({
            id: "rack-10",
            name: "Rack B",
            height: 10,
            width: 10,
          }),
        ],
        getDeviceLibrary: () => [measured],
        getActiveRackId: () => "rack-10",
        getTargetFace: () => "front",
        setActiveRack: vi.fn(),
        setCursor: vi.fn(),
        announce,
        abandonPlacement,
      },
      measured,
    );

    expect(abandonPlacement).toHaveBeenCalled();
  });

  it("states the same requirement on Enter rather than reporting no room", () => {
    const announce = vi.fn();
    const showToast = vi.fn();

    controllerFor("rack-10", announce, showToast).handleKeyDown(
      new KeyboardEvent("keydown", { key: "Enter" }),
    );

    expect(showToast.mock.calls.at(-1)?.[0] as string).toContain("shelf");
    expect(showToast).not.toHaveBeenCalledWith("No room for this device here");
  });
});
