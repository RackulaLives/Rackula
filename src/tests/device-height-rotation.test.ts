/**
 * Measured height and turning a device 90 degrees.
 *
 * A device type may carry its measured height (height_mm), from which its rack
 * units are derived. A placed device with a measured width may be turned 90
 * degrees and back; the turn swaps its width and height, so a mini PC lying
 * flat stands on its side in a narrow cell of a taller carrier.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { LayoutSchema } from "$lib/schemas";
import { synthesizeCarrierForDevice } from "$lib/utils/collision";
import {
  getRackOpeningMm,
  orientDeviceType,
  uHeightForMm,
} from "$lib/utils/device-width";
import { buildCustomCarrierType } from "$lib/utils/custom-carrier";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import { encodeLayout, decodeLayout } from "$lib/utils/share";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import { createPlacementKeyboardController } from "$lib/utils/placement-keyboard-controller";
import type { DeviceType, PlacedDevice } from "$lib/types";
import {
  createTestContainerChild,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

/** A mini PC lying flat: 179 mm wide, 34.5 mm tall. */
function miniPc(overrides: Partial<DeviceType> = {}): DeviceType {
  return {
    ...createTestDeviceType({
      slug: "mini-pc",
      model: "Mini PC",
      u_height: 1,
      width_mm: 179,
      height_mm: 34.5,
    }),
    ...overrides,
  };
}

const OPENING_19 = getRackOpeningMm(19);

describe("rack units from a measured height", () => {
  it("takes the smallest half U that holds the device", () => {
    expect(uHeightForMm(34.5)).toBe(1);
    expect(uHeightForMm(44.45)).toBe(1);
    expect(uHeightForMm(50)).toBe(1.5);
    expect(uHeightForMm(179)).toBe(4.5);
  });

  it("never goes below half a U", () => {
    expect(uHeightForMm(5)).toBe(0.5);
  });

  it("allows half a millimetre for rounding", () => {
    expect(uHeightForMm(44.9)).toBe(1);
  });
});

describe("a turned device's footprint", () => {
  it("swaps width and height at 90 degrees", () => {
    const turned = orientDeviceType(miniPc(), 90);
    expect(turned.width_mm).toBe(34.5);
    expect(turned.height_mm).toBe(179);
    expect(turned.u_height).toBe(4.5);
  });

  it("keeps the footprint unturned", () => {
    expect(orientDeviceType(miniPc(), undefined)).toEqual(miniPc());
    expect(orientDeviceType(miniPc(), 0)).toEqual(miniPc());
  });

  it("takes the width from the rack units when no height was measured", () => {
    const tall = createTestDeviceType({ u_height: 2, width_mm: 100 });
    expect(orientDeviceType(tall, 90).width_mm).toBeCloseTo(88.9, 6);
  });

  it("leaves a device with no measured width alone", () => {
    const rackMount = createTestDeviceType({ u_height: 1 });
    expect(orientDeviceType(rackMount, 90)).toEqual(rackMount);
  });
});

describe("carriers for measured heights", () => {
  it("gives a device 4.5U tall a whole 5U carrier", () => {
    const plan = synthesizeCarrierForDevice(
      createTestDeviceType({ u_height: 4.5, width_mm: 100 }),
      19,
    );
    expect(plan?.type?.u_height).toBe(5);
    expect(plan?.type?.slots?.[0]?.height_units).toBe(4.5);
  });
});

describe("turning a placed device", () => {
  let store: ReturnType<typeof getLayoutStore>;

  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    store = getLayoutStore();
  });

  /** A 20U rack with a mini PC dropped at U5, in its own generated carrier. */
  function placedMiniPc() {
    const rack = store.addRack("Rack", 20)!;
    store.addDeviceTypeRaw(miniPc());
    expect(store.placeDeviceSmart(rack.id, "mini-pc", 5)).toBe(true);
    return rack.id;
  }

  function child(rackId: string): PlacedDevice {
    return store.getRackById(rackId)!.devices.find((d) => d.container_id)!;
  }

  function childIndex(rackId: string): number {
    return store.getRackById(rackId)!.devices.indexOf(child(rackId));
  }

  function carrierType(rackId: string): DeviceType {
    const carrier = store
      .getRackById(rackId)!
      .devices.find((d) => d.id === child(rackId).container_id)!;
    return store.device_types.find((dt) => dt.slug === carrier.device_type)!;
  }

  it("stands a mini PC on its side in a taller, narrower carrier", () => {
    const rackId = placedMiniPc();

    expect(store.rotateDevice(rackId, childIndex(rackId))).toBe(true);

    expect(child(rackId).rotation).toBe(90);
    expect(carrierType(rackId).u_height).toBe(5);
    expect(carrierType(rackId).slots?.[0]?.width_fraction).toBeCloseTo(
      34.5 / OPENING_19,
      6,
    );
  });

  it("lays it back flat in its flat carrier on the next turn", () => {
    const rackId = placedMiniPc();

    expect(store.rotateDevice(rackId, childIndex(rackId))).toBe(true);
    expect(store.rotateDevice(rackId, childIndex(rackId))).toBe(true);

    expect(child(rackId).rotation ?? 0).toBe(0);
    expect(carrierType(rackId).u_height).toBe(1);
    expect(carrierType(rackId).slots?.[0]?.width_fraction).toBeCloseTo(
      179 / OPENING_19,
      6,
    );
  });

  it("refuses to stand it up when a device above leaves no room", () => {
    const rackId = placedMiniPc();
    store.addDeviceTypeRaw(createTestDeviceType({ slug: "server" }));
    store.placeDevice(rackId, "server", 7);

    expect(store.rotateDevice(rackId, childIndex(rackId))).toBe(false);

    expect(child(rackId).rotation ?? 0).toBe(0);
    expect(carrierType(rackId).u_height).toBe(1);
  });

  it("undoes the turn and the carrier together", () => {
    const rackId = placedMiniPc();
    store.rotateDevice(rackId, childIndex(rackId));

    store.undo();

    expect(child(rackId).rotation ?? 0).toBe(0);
    expect(carrierType(rackId).u_height).toBe(1);
  });

  it("does not turn a device with no measured width", () => {
    const rack = store.addRack("Rack", 12)!;
    store.addDeviceTypeRaw(
      createTestDeviceType({ slug: "half", u_height: 1, slot_width: 1 }),
    );
    store.placeDeviceSmart(rack.id, "half", 5);

    expect(store.rotateDevice(rack.id, childIndex(rack.id))).toBe(false);
    expect(child(rack.id).rotation ?? 0).toBe(0);
  });

  it("refuses to stand it up in a shipped 1U shelf cell", () => {
    const rack = store.addRack("Rack", 12)!;
    store.addDeviceTypeRaw(miniPc({ width_mm: 100, height_mm: 30 }));
    store.placeDevice(rack.id, "shelf-1u-3slot", 5);
    const shelf = store
      .getRackById(rack.id)!
      .devices.find((d) => d.device_type === "shelf-1u-3slot")!;
    expect(
      store.placeInContainer(rack.id, "mini-pc", shelf.id, "center", 0),
    ).toBe(true);

    expect(store.rotateDevice(rack.id, childIndex(rack.id))).toBe(false);
    expect(child(rack.id).rotation ?? 0).toBe(0);
    expect(child(rack.id).container_id).toBe(shelf.id);
  });

  it("changes the carrier's height, not its cell, when a turned device's width changes", () => {
    const rackId = placedMiniPc();
    store.rotateDevice(rackId, childIndex(rackId));

    expect(store.updateDeviceType("mini-pc", { width_mm: 130 })).toBe(true);

    expect(carrierType(rackId).u_height).toBe(3);
    expect(carrierType(rackId).slots?.[0]?.width_fraction).toBeCloseTo(
      34.5 / OPENING_19,
      6,
    );
  });

  it("recuts a turned device's cell when its height changes", () => {
    const rackId = placedMiniPc();
    store.rotateDevice(rackId, childIndex(rackId));

    expect(store.updateDeviceType("mini-pc", { height_mm: 40 })).toBe(true);

    expect(carrierType(rackId).slots?.[0]?.width_fraction).toBeCloseTo(
      40 / OPENING_19,
      6,
    );
  });

  it("keeps the turn when the device moves to another U", () => {
    const rackId = placedMiniPc();
    store.rotateDevice(rackId, childIndex(rackId));

    expect(store.moveDeviceSmart(rackId, childIndex(rackId), rackId, 12)).toBe(
      true,
    );

    expect(child(rackId).rotation).toBe(90);
    expect(carrierType(rackId).u_height).toBe(5);
  });
});

describe("turning a device before it is placed", () => {
  let store: ReturnType<typeof getLayoutStore>;

  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    resetPlacementStore();
    store = getLayoutStore();
  });

  function carrierOf(rackId: string): DeviceType {
    const carrier = store
      .getRackById(rackId)!
      .devices.find((d) => !d.container_id)!;
    return store.device_types.find((dt) => dt.slug === carrier.device_type)!;
  }

  it("places a mini PC already standing on its side", () => {
    const rack = store.addRack("Rack", 20)!;
    store.addDeviceTypeRaw(miniPc());

    expect(store.placeDeviceSmart(rack.id, "mini-pc", 5, "front", 90)).toBe(
      true,
    );

    const child = store
      .getRackById(rack.id)!
      .devices.find((d) => d.container_id)!;
    expect(child.rotation).toBe(90);
    expect(carrierOf(rack.id).u_height).toBe(5);
  });

  it("stands a second one beside the first when placed on its carrier", () => {
    const rack = store.addRack("Rack", 20)!;
    store.addDeviceTypeRaw(miniPc());
    store.placeDeviceSmart(rack.id, "mini-pc", 5, "front", 90);

    // U7 is inside the 5U carrier standing at U5.
    expect(store.placeDeviceSmart(rack.id, "mini-pc", 7, "front", 90)).toBe(
      true,
    );

    const children = store
      .getRackById(rack.id)!
      .devices.filter((d) => d.container_id);
    expect(children.map((d) => d.rotation)).toEqual([90, 90]);
    const cells = carrierOf(rack.id).slots ?? [];
    expect(cells.map((c) => c.width_fraction)).toEqual([
      34.5 / OPENING_19,
      34.5 / OPENING_19,
    ]);
    expect(carrierOf(rack.id).u_height).toBe(5);
  });

  it("hands out the armed device turned once R is pressed, and back", () => {
    const placement = getPlacementStore();
    placement.startPlacement(miniPc());

    expect(placement.toggleRotation()).toBe(true);
    expect(placement.rotation).toBe(90);
    expect(placement.pendingDevice?.u_height).toBe(4.5);

    expect(placement.toggleRotation()).toBe(true);
    expect(placement.rotation).toBe(0);
    expect(placement.pendingDevice?.u_height).toBe(1);
  });

  it("does not turn an armed device with no measured width", () => {
    const placement = getPlacementStore();
    placement.startPlacement(createTestDeviceType({ slug: "server" }));

    expect(placement.toggleRotation()).toBe(false);
    expect(placement.rotation).toBe(0);
  });

  it("turns the armed device on R during placement", () => {
    const toggleRotation = vi.fn(() => true);
    const controller = createPlacementKeyboardController({
      getRacks: () => [],
      getDeviceLibrary: () => [],
      getActiveRackId: () => null,
      isPlacing: () => true,
      getPendingDevice: () => miniPc(),
      getTargetFace: () => "front",
      getCursorPosition: () => null,
      setActiveRack: vi.fn(),
      setCursor: vi.fn(),
      announce: vi.fn(),
      cancelPlacement: vi.fn(),
      abandonPlacement: vi.fn(),
      placeDevice: vi.fn(() => true),
      completePlacement: vi.fn(),
      toggleRotation,
    });

    expect(
      controller.handleKeyDown(new KeyboardEvent("keydown", { key: "r" })),
    ).toBe(true);
    expect(toggleRotation).toHaveBeenCalled();
    expect(
      controller.handleKeyDown(
        new KeyboardEvent("keydown", { key: "r", ctrlKey: true }),
      ),
    ).toBe(false);
  });
});

describe("loading a turned device", () => {
  /** A 19" rack holding a mini PC in a 5U carrier cut to its turned width. */
  function standingLayout(rotation: PlacedDevice["rotation"]) {
    const device = miniPc();
    const carrier = buildCustomCarrierType(
      5,
      [{ widthFraction: 34.5 / OPENING_19, heightUnits: 4.5 }],
      [],
    );
    return createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          height: 12,
          devices: [
            createTestDevice({
              id: "carrier-1",
              device_type: carrier.slug,
              position: 30,
              face: "both",
            }),
            {
              ...createTestContainerChild({
                id: "child-1",
                device_type: device.slug,
                container_id: "carrier-1",
                slot_id: "col-1",
              }),
              rotation,
            },
          ],
        }),
      ],
      device_types: [carrier, device],
    });
  }

  it("accepts a turned child in a cell cut to its turned width", () => {
    expect(LayoutSchema.safeParse(standingLayout(90)).success).toBe(true);
  });

  it("rejects the same child unturned as too wide for that cell", () => {
    const result = LayoutSchema.safeParse(standingLayout(undefined));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /too wide/i.test(i.message))).toBe(
        true,
      );
    }
  });

  it("keeps the height and the turn through a YAML round-trip", async () => {
    const restored = await parseLayoutYaml(
      await serializeLayoutToYaml(standingLayout(90)),
    );
    expect(
      restored.device_types.find((dt) => dt.slug === "mini-pc")?.height_mm,
    ).toBe(34.5);
    expect(
      restored.racks[0]?.devices.find((d) => d.container_id)?.rotation,
    ).toBe(90);
  });

  it("keeps the height and the turn through a share link", () => {
    const encoded = encodeLayout(standingLayout(90));
    expect(typeof encoded).toBe("string");
    const { layout } = decodeLayout(encoded as string);
    expect(
      layout?.device_types.find((dt) => dt.slug === "mini-pc")?.height_mm,
    ).toBe(34.5);
    expect(
      layout?.racks[0]?.devices.find((d) => d.container_id)?.rotation,
    ).toBe(90);
  });
});
