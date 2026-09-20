/**
 * Carrier-First Placement Tests (C3, epic #2158)
 *
 * Covers the carrier-first drag/drop behaviour:
 * - A sub-U / half-width device dropped on bare rack synthesises a carrier and
 *   places the device as a child (marked auto_created on the carrier).
 * - Dropping near a carrier with a free cell fills that cell.
 * - One child per cell; the four cells of a 2x2 carrier are each fillable.
 * - An oversized child is rejected.
 * - findNextFreeChildPosition returns the first empty cell in slot order.
 * - synthesizeCarrierForDevice picks the carrier slug from device dimensions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { findStarterDevice } from "$lib/data/starterLibrary";
import {
  findNextFreeChildPosition,
  synthesizeCarrierForDevice,
} from "$lib/utils/collision";
import { createTestDeviceType } from "./factories";
import { CATEGORY_COLOURS } from "$lib/types/constants";
import type { PlacedDevice } from "$lib/types";
import { LayoutSchema } from "$lib/schemas";
import { toInternalUnits } from "$lib/utils/position";
import { dispatchDropAction } from "$lib/utils/rack-drop-handlers";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { resetCarrierHint } from "$lib/stores/layout/device-actions";
import { CARRIER_HINT_MESSAGE } from "$lib/constants/toast-messages";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
  resetCarrierHint();
});

/** A 0.5U half-width device (needs a 2x2 carrier). */
const halfWidthHalfHeight = createTestDeviceType({
  slug: "rb5009",
  u_height: 0.5,
  slot_width: 1,
});

/** A 1U half-width device (needs a 1x2 carrier). */
const halfWidthFullHeight = createTestDeviceType({
  slug: "mini-1u",
  u_height: 1,
  slot_width: 1,
});

/** A standard 1U full-width device (never needs a carrier). */
const fullWidthDevice = createTestDeviceType({
  slug: "server-1u",
  u_height: 1,
  slot_width: 2,
});

/** A 0.5U full-width device: no half-width carrier can hold it. */
const fullWidthSubU = createTestDeviceType({
  slug: "blank-0-5u",
  u_height: 0.5,
  slot_width: 2,
});

describe("synthesizeCarrierForDevice", () => {
  it("returns the 2x2 carrier slug for a half-width half-height device", () => {
    expect(synthesizeCarrierForDevice(halfWidthHalfHeight, 19)?.slug).toBe(
      "carrier-1u-2x2",
    );
  });

  it("returns the 2-col carrier slug for a half-width full-height device", () => {
    expect(synthesizeCarrierForDevice(halfWidthFullHeight, 19)?.slug).toBe(
      "carrier-1u-2col",
    );
  });

  it("returns null for a full-width whole-U device (no carrier needed)", () => {
    expect(synthesizeCarrierForDevice(fullWidthDevice, 19)).toBeNull();
  });

  it("returns null for a full-width sub-U device (no half-width carrier fits)", () => {
    expect(synthesizeCarrierForDevice(fullWidthSubU, 19)).toBeNull();
  });
});

describe("findNextFreeChildPosition", () => {
  const carrier2x2 = findStarterDevice("carrier-1u-2x2")!;

  function childIn(slotId: string): PlacedDevice {
    return {
      id: `child-${slotId}`,
      device_type: "rb5009",
      position: 0,
      face: "front",
      container_id: "carrier-1",
      slot_id: slotId,
    };
  }

  it("returns the first slot when the carrier is empty", () => {
    const free = findNextFreeChildPosition(carrier2x2, []);
    expect(free).toEqual({ slotId: "r0-c0", position: 0 });
  });

  it("skips occupied cells and returns the next free cell", () => {
    const free = findNextFreeChildPosition(carrier2x2, [childIn("r0-c0")]);
    expect(free).toEqual({ slotId: "r0-c1", position: 0 });
  });

  it("reaches the upper-row cells once the bottom row is full (y-aware)", () => {
    const free = findNextFreeChildPosition(carrier2x2, [
      childIn("r0-c0"),
      childIn("r0-c1"),
    ]);
    expect(free).toEqual({ slotId: "r1-c0", position: 0 });
  });

  it("returns null when every cell is occupied", () => {
    const free = findNextFreeChildPosition(carrier2x2, [
      childIn("r0-c0"),
      childIn("r0-c1"),
      childIn("r1-c0"),
      childIn("r1-c1"),
    ]);
    expect(free).toBeNull();
  });
});

describe("placeDeviceSmart (store carrier-first flow)", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  function setupRack(height = 12): { store: Store; rackId: string } {
    const store = getLayoutStore()!;
    const rack = store.addRack("Test Rack", height);
    return { store, rackId: rack!.id };
  }

  /** Register a 0.5U half-width device (needs a 2x2 carrier). */
  function addRb5009(store: Store) {
    return store.addDeviceType({
      name: "RB5009",
      u_height: 0.5,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });
  }

  function carrierIn(store: Store) {
    return store.rack!.devices.find((d) => d.device_type.startsWith("carrier"));
  }

  function childrenOf(store: Store, carrierId: string) {
    return store.rack!.devices.filter((d) => d.container_id === carrierId);
  }

  it("synthesises a carrier and places a sub-U device on a bare rack", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);

    const carrier = carrierIn(store)!;
    expect(carrier.device_type).toBe("carrier-1u-2x2");
    expect(carrier.auto_created).toBe(true);

    const child = childrenOf(store, carrier.id)[0];
    expect(child?.device_type).toBe(dt.slug);
  });

  it("places a full-width device directly on the rail without a carrier", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Server 1U",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);

    expect(carrierIn(store)).toBeUndefined();
    const placed = store.rack!.devices.find((d) => d.device_type === dt.slug);
    expect(placed?.container_id).toBeUndefined();
  });

  it("hints on the first auto-created carrier only, not on later ones", () => {
    resetToastStore();
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);
    const toastStore = getToastStore();
    const hintShown = () =>
      toastStore.toasts.some((t) => t.message === CARRIER_HINT_MESSAGE);

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);
    expect(hintShown()).toBe(true);

    // A second auto-created carrier in the same session stays quiet, even
    // once the first hint has gone.
    toastStore.clearAllToasts();
    expect(store.placeDeviceSmart(rackId, dt.slug, 8)).toBe(true);
    expect(hintShown()).toBe(false);
  });

  it("fills a free cell of an existing carrier at the target U", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    // First drop synthesises the carrier at U5.
    store.placeDeviceSmart(rackId, dt.slug, 5);
    const carrier = carrierIn(store)!;
    const carrierU = carrier.position;

    // Second drop at the same U fills the next free cell, not a new carrier.
    store.placeDeviceSmart(rackId, dt.slug, 5);

    const carriers = store.rack!.devices.filter((d) =>
      d.device_type.startsWith("carrier"),
    );
    // eslint-disable-next-line no-restricted-syntax -- invariant: the carrier is reused, never duplicated
    expect(carriers).toHaveLength(1);
    const children = childrenOf(store, carrier.id);
    // eslint-disable-next-line no-restricted-syntax -- invariant: two distinct cells filled
    expect(children).toHaveLength(2);
    expect(new Set(children.map((c) => c.slot_id)).size).toBe(2);
    expect(carrier.position).toBe(carrierU);
  });

  it("fills all four cells of a 2x2 carrier across repeated drops", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    for (let i = 0; i < 4; i++) {
      expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(true);
    }

    const carrier = carrierIn(store)!;
    const children = childrenOf(store, carrier.id);
    // eslint-disable-next-line no-restricted-syntax -- invariant: a 2x2 carrier has exactly four cells
    expect(children).toHaveLength(4);
    expect(new Set(children.map((c) => c.slot_id)).size).toBe(4);
  });

  it("rejects a fifth child once the 2x2 carrier is full", () => {
    const { store, rackId } = setupRack();
    const dt = addRb5009(store);

    for (let i = 0; i < 4; i++) {
      store.placeDeviceSmart(rackId, dt.slug, 5);
    }

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(false);

    const carrier = carrierIn(store)!;
    // eslint-disable-next-line no-restricted-syntax -- invariant: a full carrier gains no fifth child
    expect(childrenOf(store, carrier.id)).toHaveLength(4);
  });

  it("rejects a child too tall to fit any carrier cell", () => {
    const { store, rackId } = setupRack();
    // A 0.75U half-width device routes to the 2x2 carrier (0.5U cells) but does
    // not fit; placement is rejected rather than committed.
    const dt = store.addDeviceType({
      name: "Tall Half",
      u_height: 0.75,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });

    expect(store.placeDeviceSmart(rackId, dt.slug, 5)).toBe(false);
    expect(carrierIn(store)).toBeUndefined();
  });
});

// --- Container lifecycle (#2295) -------------------------------------------

type LifecycleStore = NonNullable<ReturnType<typeof getLayoutStore>>;

/** A rack plus a 1U half-width device type (mounts in carrier-1u-2col). */
function setupLifecycle(): {
  store: LifecycleStore;
  rackId: string;
  slug: string;
} {
  const store = getLayoutStore()!;
  const rack = store.addRack("Test Rack", 12)!;
  const dt = store.addDeviceType({
    name: "Mini Switch",
    u_height: 1,
    category: "network",
    colour: CATEGORY_COLOURS.network,
    slot_width: 1,
    interfaces: [{ name: "eth0", type: "1000base-t" }],
  });
  return { store, rackId: rack.id, slug: dt.slug };
}

function devicesIn(store: LifecycleStore, rackId: string) {
  return store.getRackById(rackId)!.devices;
}

function carriersIn(store: LifecycleStore, rackId: string) {
  return devicesIn(store, rackId).filter((d) =>
    d.device_type.startsWith("carrier"),
  );
}

function indexIn(store: LifecycleStore, rackId: string, id: string) {
  return devicesIn(store, rackId).findIndex((d) => d.id === id);
}

function childIn(store: LifecycleStore, rackId: string, carrierId: string) {
  return devicesIn(store, rackId).find((d) => d.container_id === carrierId)!;
}

/** Plain, id-sorted copy of a rack's devices, for before/after comparisons. */
function snapshotRack(store: LifecycleStore, rackId: string) {
  return (
    JSON.parse(JSON.stringify(devicesIn(store, rackId))) as PlacedDevice[]
  ).sort((a, b) => a.id.localeCompare(b.id));
}

describe("auto-created carrier lifecycle (#2295)", () => {
  it("removes an auto-created carrier with its last child, in one undo step", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;
    const child = childIn(store, rackId, carrier.id);

    store.removeDeviceFromRack(rackId, indexIn(store, rackId, child.id));

    expect(devicesIn(store, rackId)).toEqual([]);

    store.undo();

    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([carrier.id]);
    expect(childIn(store, rackId, carrier.id).id).toBe(child.id);
    expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
  });

  it("keeps an auto-created carrier while it still holds another child", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    store.placeDeviceSmart(rackId, slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;
    const child = childIn(store, rackId, carrier.id);

    store.removeDeviceFromRack(rackId, indexIn(store, rackId, child.id));

    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([carrier.id]);
  });

  it("removes an auto-created carrier when its children's device type is deleted, undoably", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    store.placeDeviceSmart(rackId, slug, 5);
    const before = snapshotRack(store, rackId);

    store.deleteDeviceType(slug);

    expect(devicesIn(store, rackId)).toEqual([]);

    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
    expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
  });

  it("removes an auto-created carrier when a bulk library cleanup deletes its children's types, undoably", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    const before = snapshotRack(store, rackId);

    store.deleteMultipleDeviceTypesRecorded([slug]);

    expect(devicesIn(store, rackId)).toEqual([]);

    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("keeps an auto-created carrier when deleting one of two device types it holds", () => {
    const { store, rackId, slug } = setupLifecycle();
    const other = store.addDeviceType({
      name: "Other Half",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });
    store.placeDeviceSmart(rackId, slug, 5);
    store.placeDeviceSmart(rackId, other.slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;

    store.deleteDeviceType(slug);

    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([carrier.id]);
  });

  it("removes a container's children when the container's device type is deleted, undoably", () => {
    const { store, rackId, slug } = setupLifecycle();
    const shelfType = store.addDeviceType({
      name: "Two Bay Shelf",
      u_height: 1,
      category: "shelf",
      colour: CATEGORY_COLOURS.shelf,
      slots: [
        { id: "left", position: { row: 0, col: 0 }, width_fraction: 0.5 },
        { id: "right", position: { row: 0, col: 1 }, width_fraction: 0.5 },
      ],
    });
    store.placeDevice(rackId, shelfType.slug, 5);
    const shelf = devicesIn(store, rackId)[0]!;
    store.placeInContainer(rackId, slug, shelf.id, "left", 0);
    const before = snapshotRack(store, rackId);

    store.deleteDeviceType(shelfType.slug);

    expect(devicesIn(store, rackId)).toEqual([]);
    expect(LayoutSchema.safeParse(store.layout).success).toBe(true);

    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("keeps a user-placed carrier when its last child is removed", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDevice(rackId, "carrier-1u-2col", 5);
    store.placeDeviceSmart(rackId, slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;
    expect(carrier.auto_created).toBeFalsy();
    const child = childIn(store, rackId, carrier.id);

    store.removeDeviceFromRack(rackId, indexIn(store, rackId, child.id));

    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([carrier.id]);
  });
});

// Selecting another rack changes the active rack between an edit and its
// undo/redo. Each edit must replay against the rack it was made in.
describe("carrier edits replay in their own rack after a rack switch (#2295)", () => {
  function setupTwoRacks() {
    const { store, rackId, slug } = setupLifecycle();
    const other = store.addRack("Other Rack", 12)!;
    store.placeDeviceSmart(rackId, slug, 5);
    return { store, rackId, otherId: other.id, slug };
  }

  function expectReplaysInRack(
    store: LifecycleStore,
    rackId: string,
    otherId: string,
    edit: () => void,
  ) {
    const before = snapshotRack(store, rackId);
    edit();
    const after = snapshotRack(store, rackId);

    store.setActiveRack(otherId);
    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
    expect(devicesIn(store, otherId)).toEqual([]);

    store.setActiveRack(otherId);
    store.redo();
    expect(snapshotRack(store, rackId)).toEqual(after);
    expect(devicesIn(store, otherId)).toEqual([]);
  }

  it("duplicating a carrier with its children", () => {
    const { store, rackId, otherId } = setupTwoRacks();
    const carrier = carriersIn(store, rackId)[0]!;

    expectReplaysInRack(store, rackId, otherId, () =>
      store.duplicateDevice(rackId, indexIn(store, rackId, carrier.id)),
    );
  });

  it("duplicating a carrier child into the next cell", () => {
    const { store, rackId, otherId } = setupTwoRacks();
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;

    expectReplaysInRack(store, rackId, otherId, () =>
      store.duplicateDevice(rackId, indexIn(store, rackId, child.id)),
    );
  });

  it("removing the last child of an auto-created carrier", () => {
    const { store, rackId, otherId } = setupTwoRacks();
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;

    expectReplaysInRack(store, rackId, otherId, () =>
      store.removeDeviceFromRack(rackId, indexIn(store, rackId, child.id)),
    );
  });

  it("moving a child one cell over", () => {
    const { store, rackId, otherId } = setupTwoRacks();
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;

    expectReplaysInRack(store, rackId, otherId, () =>
      store.moveDeviceToAdjacentSlot(
        rackId,
        indexIn(store, rackId, child.id),
        "right",
      ),
    );
  });
});

describe("moving a carrier child keeps its identity (#2295)", () => {
  it("moves a child onto bare rails into a new carrier, keeping its fields and ports", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    const oldCarrier = carriersIn(store, rackId)[0]!;
    const childId = childIn(store, rackId, oldCarrier.id).id;
    store.updateDeviceName(rackId, indexIn(store, rackId, childId), "Core");
    store.updateDeviceNotes(rackId, indexIn(store, rackId, childId), "uplink");
    const child = devicesIn(store, rackId).find((d) => d.id === childId)!;
    const portIds = (child.ports ?? []).map((p) => p.id);

    expect(
      store.moveDeviceSmart(rackId, indexIn(store, rackId, childId), rackId, 8),
    ).toBe(true);

    const moved = devicesIn(store, rackId).find((d) => d.id === childId)!;
    expect(moved.name).toBe("Core");
    expect(moved.notes).toBe("uplink");
    expect((moved.ports ?? []).map((p) => p.id)).toEqual(portIds);
    const newCarrier = devicesIn(store, rackId).find(
      (d) => d.id === moved.container_id,
    )!;
    expect(newCarrier.position).toBe(toInternalUnits(8));
    expect(newCarrier.auto_created).toBe(true);
    // The old auto-created carrier was emptied by the move, so it went too.
    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([newCarrier.id]);
    expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
  });

  it("undoes a child move in one step", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;
    const child = childIn(store, rackId, carrier.id);
    const before = snapshotRack(store, rackId);

    store.moveDeviceSmart(rackId, indexIn(store, rackId, child.id), rackId, 8);
    store.undo();

    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("keeps the moved child's connections", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    store.placeDeviceSmart(rackId, slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;
    const [a, b] = devicesIn(store, rackId).filter(
      (d) => d.container_id === carrier.id,
    );
    const connection = {
      id: "connection-1",
      a_port_id: a!.ports![0]!.id,
      b_port_id: b!.ports![0]!.id,
    };
    store.addConnectionRaw(connection);

    store.moveDeviceSmart(rackId, indexIn(store, rackId, a!.id), rackId, 8);

    expect(store.layout.connections).toEqual([connection]);
    expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
  });

  it("moves a child into a free cell of a carrier already at the target U", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    const first = carriersIn(store, rackId)[0]!;
    store.placeDeviceSmart(rackId, slug, 8);
    const second = carriersIn(store, rackId).find((c) => c.id !== first.id)!;
    const child = childIn(store, rackId, first.id);

    store.moveDeviceSmart(rackId, indexIn(store, rackId, child.id), rackId, 8);

    const moved = devicesIn(store, rackId).find((d) => d.id === child.id)!;
    expect(moved.container_id).toBe(second.id);
    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([second.id]);
  });

  it("moves a child into a chosen cell of a user-placed carrier", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDevice(rackId, "carrier-1u-2col", 8);
    const target = carriersIn(store, rackId)[0]!;
    store.placeDeviceSmart(rackId, slug, 5);
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;

    expect(
      store.moveDeviceIntoContainer(
        rackId,
        indexIn(store, rackId, child.id),
        rackId,
        target.id,
        "col-2",
        0,
      ),
    ).toBe(true);

    const moved = devicesIn(store, rackId).find((d) => d.id === child.id)!;
    expect(moved.container_id).toBe(target.id);
    expect(moved.slot_id).toBe("col-2");
    expect(carriersIn(store, rackId).map((c) => c.id)).toEqual([target.id]);
  });

  it("refuses an occupied cell and changes nothing", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 8);
    const target = carriersIn(store, rackId)[0]!;
    const occupiedSlot = childIn(store, rackId, target.id).slot_id!;
    store.placeDeviceSmart(rackId, slug, 5);
    const source = carriersIn(store, rackId).find((c) => c.id !== target.id)!;
    const child = childIn(store, rackId, source.id);
    const before = snapshotRack(store, rackId);

    expect(
      store.moveDeviceIntoContainer(
        rackId,
        indexIn(store, rackId, child.id),
        rackId,
        target.id,
        occupiedSlot,
        0,
      ),
    ).toBe(false);
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("moves a child to another rack in one undo step", () => {
    const { store, rackId, slug } = setupLifecycle();
    const other = store.addRack("Other Rack", 12)!;
    store.placeDeviceSmart(rackId, slug, 5);
    const carrier = carriersIn(store, rackId)[0]!;
    const child = childIn(store, rackId, carrier.id);
    const before = snapshotRack(store, rackId);

    expect(
      store.moveDeviceSmart(
        rackId,
        indexIn(store, rackId, child.id),
        other.id,
        3,
      ),
    ).toBe(true);

    expect(devicesIn(store, rackId)).toEqual([]);
    const moved = devicesIn(store, other.id).find((d) => d.id === child.id)!;
    expect(carriersIn(store, other.id).map((c) => c.id)).toEqual([
      moved.container_id,
    ]);

    store.undo();

    expect(devicesIn(store, other.id)).toEqual([]);
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("undo restores the original id when the move had to remap it", () => {
    const { store, rackId, slug } = setupLifecycle();
    const other = store.addRack("Other Rack", 12)!;
    store.placeDeviceSmart(rackId, slug, 5);
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;
    // Force an id collision in the target rack (#1363 remap path).
    store.setActiveRack(other.id);
    store.placeDeviceRaw({
      id: child.id,
      device_type: slug,
      position: 0,
      face: "front",
      container_id: "elsewhere",
      slot_id: "col-1",
    });
    const before = snapshotRack(store, rackId);

    store.moveDeviceSmart(
      rackId,
      indexIn(store, rackId, child.id),
      other.id,
      8,
    );
    store.undo();

    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("never moves a container into a cell, including its own", () => {
    const { store, rackId } = setupLifecycle();
    const bayType = store.addDeviceType({
      name: "One Bay Shelf",
      u_height: 1,
      category: "shelf",
      colour: CATEGORY_COLOURS.shelf,
      slots: [{ id: "bay", position: { row: 0, col: 0 }, width_fraction: 1 }],
    });
    store.placeDevice(rackId, bayType.slug, 5);
    store.placeDevice(rackId, bayType.slug, 8);
    const [a, b] = devicesIn(store, rackId);
    const before = snapshotRack(store, rackId);

    expect(
      store.moveDeviceIntoContainer(
        rackId,
        indexIn(store, rackId, a!.id),
        rackId,
        b!.id,
        "bay",
        0,
      ),
    ).toBe(false);
    expect(
      store.moveDeviceIntoContainer(
        rackId,
        indexIn(store, rackId, a!.id),
        rackId,
        a!.id,
        "bay",
        0,
      ),
    ).toBe(false);
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  function dragDataFor(store: LifecycleStore, rackId: string, id: string) {
    const device = devicesIn(store, rackId).find((d) => d.id === id)!;
    return {
      type: "rack-device" as const,
      device: store.device_types.find((dt) => dt.slug === device.device_type)!,
      sourceRackId: rackId,
      sourceIndex: indexIn(store, rackId, id),
    };
  }

  it("a carrier drop of a dragged child moves it in one undo step", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDeviceSmart(rackId, slug, 5);
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;
    const before = snapshotRack(store, rackId);

    dispatchDropAction(
      {
        kind: "carrier-drop",
        rackId,
        slug,
        targetU: 8,
        face: "front",
        dragData: dragDataFor(store, rackId, child.id),
      },
      {},
      {
        rack: store.getRackById(rackId)!,
        deviceLibrary: store.device_types,
        toastStore: getToastStore(),
        layoutStore: store,
      },
    );

    const moved = devicesIn(store, rackId).find((d) => d.id === child.id)!;
    const carrier = devicesIn(store, rackId).find(
      (d) => d.id === moved.container_id,
    )!;
    expect(carrier.position).toBe(toInternalUnits(8));

    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("a container drop of a dragged child moves it into the cell in one undo step", () => {
    const { store, rackId, slug } = setupLifecycle();
    store.placeDevice(rackId, "carrier-1u-2col", 8);
    const target = carriersIn(store, rackId)[0]!;
    store.placeDeviceSmart(rackId, slug, 5);
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;
    const before = snapshotRack(store, rackId);

    dispatchDropAction(
      {
        kind: "container-drop",
        rackId,
        slug,
        containerTarget: {
          containerId: target.id,
          slotId: "col-2",
          position: 0,
        },
        dragData: dragDataFor(store, rackId, child.id),
      },
      {},
      {
        rack: store.getRackById(rackId)!,
        deviceLibrary: store.device_types,
        toastStore: getToastStore(),
        layoutStore: store,
      },
    );

    const moved = devicesIn(store, rackId).find((d) => d.id === child.id)!;
    expect(moved.container_id).toBe(target.id);
    expect(moved.slot_id).toBe("col-2");

    store.undo();
    expect(snapshotRack(store, rackId)).toEqual(before);
  });

  it("refuses a move with no room and changes nothing", () => {
    const { store, rackId, slug } = setupLifecycle();
    const server = store.addDeviceType({
      name: "Server",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
    });
    store.placeDevice(rackId, server.slug, 8);
    store.placeDeviceSmart(rackId, slug, 5);
    const child = devicesIn(store, rackId).find((d) => d.container_id)!;
    const before = snapshotRack(store, rackId);

    expect(
      store.moveDeviceSmart(
        rackId,
        indexIn(store, rackId, child.id),
        rackId,
        8,
      ),
    ).toBe(false);
    expect(snapshotRack(store, rackId)).toEqual(before);
  });
});
