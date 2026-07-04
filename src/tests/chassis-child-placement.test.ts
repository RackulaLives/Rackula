/**
 * Honest placement for half-width oversize devices (#2854).
 *
 * Two decisions, one regression suite:
 *
 * 1. CHASSIS CHILDREN (subdevice_role === "child", e.g. blade servers) mount
 *    ONLY into an existing chassis bay. They can never rail-mount, not even
 *    inside a synthesised carrier. The three placement layers must agree that a
 *    bare-rails drop is INVALID and say so honestly ("requires a chassis"), not
 *    "No space":
 *      - synthesizeCarrierForDevice returns null (no rail carrier)
 *      - requiresChassisBay is true
 *      - resolveDropTarget preview feedback is "invalid" on bare rails
 *      - validStartPositions announces no rail slots (keyboard honesty)
 *      - placeDeviceSmart refuses the placement
 *      - resolveDropAction returns invalid with an honest chassis message
 *    Placing a blade INTO a chassis bay stays valid and unchanged.
 *
 * 2. GENERIC HALF-WIDTH gear taller than 1U (no child role, e.g. the DeskPi
 *    2U 4-Pi RackMate) IS placeable on the rails via a height-matched carrier.
 *    synthesizeCarrierForDevice selects carrier-2u-2col (2U) so placeDeviceSmart
 *    can actually place it, and the preview reports it valid.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Control the resolved SVG coordinate without a real DOM geometry. The feedback
// decision under test is downstream of the coordinate math (which is unchanged).
vi.mock("$lib/utils/coordinates", async (importActual) => {
  const actual = await importActual<typeof import("$lib/utils/coordinates")>();
  return { ...actual, screenToSVG: vi.fn(() => ({ x: 100, y: 200 })) };
});

import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { findBrandDevice } from "$lib/data/brandPacks";
import { findDeviceType } from "$lib/utils/device-lookup";
import {
  synthesizeCarrierForDevice,
  requiresChassisBay,
  requiresCarrier,
} from "$lib/utils/collision";
import { validStartPositions } from "$lib/utils/placement-keyboard";
import {
  resolveDropTarget,
  resolveDropAction,
  type RackDimensions,
  type DropCoordinateInput,
} from "$lib/utils/rack-drop-coordinator";
import { createTestRack } from "./factories";
import type { DeviceType } from "$lib/types";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

/** The real chassis children: half-width, subdevice_role "child", oversize. */
const bladeHalf = findStarterDevice("blade-server-half")!; // 2U child
const bladeFull = findStarterDevice("blade-server-full")!; // 4U child
/** A real generic 2U half-width device (no child role): DeskPi 2U 4-Pi tray. */
const genericTwoU = findBrandDevice("deskpi-rackmate-2u-4-pi")!; // 2U half-width
/** A full-width whole-U rail device: no carrier applies, never a chassis bay. */
const fullWidthRail: DeviceType = {
  slug: "server-1u",
  model: "Server",
  u_height: 1,
  slot_width: 2,
  category: "server",
  colour: "#4A90D9",
};

// =============================================================================
// synthesizeCarrierForDevice — height-driven selection, null for children
// =============================================================================

describe("synthesizeCarrierForDevice (height-matched, child-aware)", () => {
  it("returns null for a chassis child regardless of height (2U blade)", () => {
    expect(synthesizeCarrierForDevice(bladeHalf)).toBeNull();
  });

  it("returns null for a chassis child regardless of height (4U blade)", () => {
    expect(synthesizeCarrierForDevice(bladeFull)).toBeNull();
  });

  it("returns the 2U carrier for a generic 2U half-width device", () => {
    expect(synthesizeCarrierForDevice(genericTwoU)).toBe("carrier-2u-2col");
  });

  it("still returns the 1U carrier for a generic 1U half-width device", () => {
    const oneU: DeviceType = {
      slug: "one-u-half",
      model: "One U Half",
      u_height: 1,
      slot_width: 1,
      category: "network",
      colour: "#4A90D9",
    };
    expect(synthesizeCarrierForDevice(oneU)).toBe("carrier-1u-2col");
  });

  it("still returns the 2x2 carrier for a sub-U half-width device", () => {
    const halfU: DeviceType = {
      slug: "half-u",
      model: "Half U",
      u_height: 0.5,
      slot_width: 1,
      category: "network",
      colour: "#4A90D9",
    };
    expect(synthesizeCarrierForDevice(halfU)).toBe("carrier-1u-2x2");
  });

  it("returns null (not a too-small carrier) for an integer height with no carrier", () => {
    const threeU: DeviceType = {
      slug: "three-u-half",
      model: "Three U Half",
      u_height: 3,
      slot_width: 1,
      category: "network",
      colour: "#4A90D9",
    };
    expect(synthesizeCarrierForDevice(threeU)).toBeNull();
  });

  it("returns null (not a too-small carrier) for a non-integer height at or above 1U", () => {
    const oneAndHalf: DeviceType = {
      slug: "one-half-u",
      model: "One and a Half U",
      u_height: 1.5,
      slot_width: 1,
      category: "network",
      colour: "#4A90D9",
    };
    expect(synthesizeCarrierForDevice(oneAndHalf)).toBeNull();
  });

  it("returns null for a full-width whole-U device", () => {
    expect(synthesizeCarrierForDevice(fullWidthRail)).toBeNull();
  });
});

// =============================================================================
// requiresChassisBay — the shared predicate for the three layers
// =============================================================================

describe("requiresChassisBay", () => {
  it("is true for a chassis child (requires a carrier but none synthesisable)", () => {
    expect(requiresChassisBay(bladeHalf)).toBe(true);
    expect(requiresChassisBay(bladeFull)).toBe(true);
    // The child still requires a carrier; it just cannot get a rail one.
    expect(requiresCarrier(bladeHalf)).toBe(true);
  });

  it("is false for a generic half-width device that has a rail carrier", () => {
    expect(requiresChassisBay(genericTwoU)).toBe(false);
  });

  it("is false for a full-width whole-U rail device", () => {
    expect(requiresChassisBay(fullWidthRail)).toBe(false);
  });
});

// =============================================================================
// validStartPositions — keyboard honesty (layer 2)
// =============================================================================

describe("validStartPositions (keyboard honesty)", () => {
  it("announces NO rail slots for a chassis child on an empty rack", () => {
    const rack = createTestRack({ height: 12, devices: [] });
    expect(validStartPositions(rack, [], bladeHalf, "front")).toEqual([]);
  });

  it("announces rail slots for a generic 2U half-width device", () => {
    const rack = createTestRack({ height: 12, devices: [] });
    // A 2U carrier fits at U1..U11 on an empty 12U rack.
    expect(
      validStartPositions(rack, [], genericTwoU, "front").length,
    ).toBeGreaterThan(0);
  });
});

// =============================================================================
// placeDeviceSmart — actual placement (layer 3)
// =============================================================================

describe("placeDeviceSmart (store) honesty", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  function setupRack(height = 12): { store: Store; rackId: string } {
    const store = getLayoutStore()!;
    const rack = store.addRack("Test Rack", height);
    return { store, rackId: rack!.id };
  }

  it("refuses a chassis child on the bare rails (no carrier synthesised)", () => {
    const { store, rackId } = setupRack();
    store.addDeviceTypeRaw(bladeHalf);

    expect(store.placeDeviceSmart(rackId, bladeHalf.slug, 5)).toBe(false);
    // Nothing lands on the rails: no child, and no phantom carrier.
    expect(
      store.rack!.devices.some(
        (d) =>
          d.device_type === bladeHalf.slug ||
          d.device_type.startsWith("carrier-"),
      ),
    ).toBe(false);
  });

  it("places a generic 2U half-width device via a synthesised 2U carrier", () => {
    const { store, rackId } = setupRack();
    store.addDeviceTypeRaw(genericTwoU);

    expect(store.placeDeviceSmart(rackId, genericTwoU.slug, 5)).toBe(true);

    const carrier = store.rack!.devices.find((d) =>
      d.device_type.startsWith("carrier"),
    );
    expect(carrier?.device_type).toBe("carrier-2u-2col");
    expect(carrier?.auto_created).toBe(true);

    const child = store.rack!.devices.find(
      (d) => d.container_id === carrier?.id,
    );
    expect(child?.device_type).toBe(genericTwoU.slug);
  });

  it("places a 2U half-width blank via the 2U carrier (blank is carried, not bay-only)", () => {
    // A half-width blank is exempt from requiresCarrier but is still half-width,
    // so it mounts inside a synthesised carrier. The height-matched 2U carrier
    // lets a 2U half blank place where the old 1U carrier could not (#2854).
    const { store, rackId } = setupRack();
    const blank2u = findStarterDevice("2u-half-blank")!;
    store.addDeviceTypeRaw(blank2u);

    expect(requiresChassisBay(blank2u)).toBe(false);
    expect(store.placeDeviceSmart(rackId, blank2u.slug, 5)).toBe(true);

    const carrier = store.rack!.devices.find((d) =>
      d.device_type.startsWith("carrier"),
    );
    expect(carrier?.device_type).toBe("carrier-2u-2col");
  });
});

// =============================================================================
// Chassis-bay placement is unchanged (blades still mount into a chassis)
// =============================================================================

describe("chassis-bay placement (unchanged)", () => {
  it("places a blade child into a real chassis bay", () => {
    const store = getLayoutStore()!;
    const chassis = findStarterDevice("blade-chassis-4u")!;
    store.addDeviceTypeRaw(chassis);
    store.addDeviceTypeRaw(bladeHalf);

    const rack = store.addRack("Test Rack", 42)!;
    store.placeDevice(rack.id, chassis.slug, 5);
    const placedChassis = store.rack!.devices.find(
      (d) => d.device_type === chassis.slug,
    )!;

    const ok = store.placeInContainer(
      rack.id,
      bladeHalf.slug,
      placedChassis.id,
      "bay-1",
      0,
    );
    expect(ok).toBe(true);

    const child = store.rack!.devices.find(
      (d) => d.container_id === placedChassis.id,
    );
    expect(child?.device_type).toBe(bladeHalf.slug);
    expect(child?.slot_id).toBe("bay-1");
  });
});

// =============================================================================
// resolveDropTarget / resolveDropAction — preview + drop agreement (layer 1)
// =============================================================================

describe("resolveDropTarget / resolveDropAction (bare-rails agreement)", () => {
  const dims: RackDimensions = {
    rackHeight: 12, // rack height in U (matches Rack.svelte's rack.height)
    rackWidth: 220,
    interiorWidth: 220 - 17 * 2,
    uHeight: 22,
    rackPadding: 0,
    railWidth: 17,
  };
  const coords: DropCoordinateInput = {
    svgElement: {} as SVGSVGElement,
    clientX: 100,
    clientY: 200,
  };

  function emptyRack() {
    return createTestRack({ height: 12, devices: [] });
  }

  it("previews a chassis child as INVALID on bare rails", () => {
    const result = resolveDropTarget(
      coords,
      dims,
      emptyRack(),
      [],
      bladeHalf,
      "front",
    );
    expect(result.feedback).toBe("invalid");
  });

  it("previews a generic 2U half-width device as VALID on bare rails", () => {
    const result = resolveDropTarget(
      coords,
      dims,
      emptyRack(),
      [],
      genericTwoU,
      "front",
    );
    // Carrier-2u-2col is resolvable at this U on an empty rack.
    expect(findDeviceType("carrier-2u-2col")).toBeDefined();
    expect(result.feedback).toBe("valid");
  });

  it("resolves a chassis-child bare-rails drop to invalid with an honest chassis message", () => {
    const action = resolveDropAction(
      coords,
      dims,
      emptyRack(),
      [],
      { type: "palette", device: bladeHalf },
      "front",
    );
    expect(action.kind).toBe("invalid");
    if (action.kind === "invalid") {
      expect(action.message).toBeDefined();
      expect(action.message).toMatch(/chassis/i);
      expect(action.message).not.toMatch(/no space/i);
    }
  });

  it("resolves a generic 2U half-width bare-rails drop to a carrier-drop", () => {
    const action = resolveDropAction(
      coords,
      dims,
      emptyRack(),
      [],
      { type: "palette", device: genericTwoU },
      "front",
    );
    expect(action.kind).toBe("carrier-drop");
    if (action.kind === "carrier-drop") {
      expect(action.slug).toBe(genericTwoU.slug);
    }
  });
});
