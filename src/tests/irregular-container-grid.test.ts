/**
 * Irregular container grids (#3342): rows of different heights and slots
 * listed out of row/column order. Rendering, drop hit-testing and fill order
 * must all derive cells from the same geometry, so the cell a device is
 * drawn in is the cell the pointer aims at and the cell filled next.
 */
import { describe, it, expect } from "vitest";
import { getSlotRects } from "$lib/utils/slot-geometry";
import {
  detectContainerDropTarget,
  detectContainerHover,
  slotAtPoint,
} from "$lib/utils/dragdrop";
import {
  findNextFreeChildPosition,
  findNextSlotForChild,
} from "$lib/utils/collision";
import { RAIL_WIDTH } from "$lib/constants/layout";
import { toInternalUnits } from "$lib/utils/position";
import type { DeviceType, PlacedDevice, Rack } from "$lib/types";
import {
  createTestContainerType,
  createTestDeviceType,
  createTestRack,
  createTestSlot,
} from "./factories";

const U = 20;
const RACK_19 = 19;
const RACK_PX = 220;
const INTERIOR = RACK_PX - RAIL_WIDTH * 2;

/**
 * A 3U chassis: a 2U bottom row split into two halves and a 1U top row split
 * into three thirds. Slots are listed top row first, right to left, so array
 * order matches neither the row nor the column order.
 */
function irregularChassis(): DeviceType {
  return createTestContainerType({
    slug: "irregular-chassis",
    u_height: 3,
    slots: [
      createTestSlot({
        id: "top-right",
        position: { row: 1, col: 2 },
        width_fraction: 1 / 3,
        height_units: 1,
      }),
      createTestSlot({
        id: "top-mid",
        position: { row: 1, col: 1 },
        width_fraction: 1 / 3,
        height_units: 1,
      }),
      createTestSlot({
        id: "top-left",
        position: { row: 1, col: 0 },
        width_fraction: 1 / 3,
        height_units: 1,
      }),
      createTestSlot({
        id: "bottom-right",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 2,
      }),
      createTestSlot({
        id: "bottom-left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
      }),
    ],
  });
}

const smallDevice = createTestDeviceType({
  slug: "small-box",
  u_height: 1,
  slot_width: 1,
  width_mm: 100,
});

function child(id: string, slotId: string): PlacedDevice {
  return {
    id,
    device_type: smallDevice.slug,
    position: 0,
    face: "both",
    container_id: "chassis",
    slot_id: slotId,
  };
}

/** A 3U rack holding the chassis at U1, so the chassis top edge is y 0. */
function rackWithChassis(children: PlacedDevice[] = []): Rack {
  return createTestRack({
    height: 3,
    devices: [
      {
        id: "chassis",
        device_type: "irregular-chassis",
        position: toInternalUnits(1),
        face: "both",
      },
      ...children,
    ],
  });
}

describe("irregular container geometry", () => {
  it("gives each row the share of the container its tallest cell asks for", () => {
    const rects = getSlotRects(irregularChassis().slots!, INTERIOR, 3 * U);

    expect(rects.get("bottom-left")).toMatchObject({ y: U, height: 2 * U });
    expect(rects.get("bottom-right")).toMatchObject({ y: U, height: 2 * U });
    expect(rects.get("top-left")).toMatchObject({ y: 0, height: U });
    expect(rects.get("top-right")).toMatchObject({ y: 0, height: U });
  });

  it("lays out the same cells whatever order the slots are listed in", () => {
    const listed = irregularChassis().slots!;
    const sorted = [...listed].sort(
      (a, b) =>
        a.position.row - b.position.row || a.position.col - b.position.col,
    );

    expect(getSlotRects(listed, INTERIOR, 3 * U)).toEqual(
      getSlotRects(sorted, INTERIOR, 3 * U),
    );
  });
});

describe("irregular container hit-testing", () => {
  it("resolves the centre of every drawn cell to that cell", () => {
    const chassis = irregularChassis();
    const rects = getSlotRects(chassis.slots!, INTERIOR, 3 * U);

    for (const slot of chassis.slots!) {
      const cell = rects.get(slot.id)!;
      const hit = slotAtPoint(
        chassis,
        cell.x + cell.width / 2,
        cell.y + cell.height / 2,
        INTERIOR,
        RACK_19,
        3,
        U,
        1,
      );
      expect(hit?.id).toBe(slot.id);
    }
  });

  it("drops into the 2U row in the lower two thirds of the chassis", () => {
    const target = detectContainerDropTarget(
      rackWithChassis(),
      [irregularChassis(), smallDevice],
      smallDevice,
      // 1.6U down from the top: inside the 2U bottom row, above its middle
      1.6 * U,
      INTERIOR * 0.75,
      RACK_PX,
      3,
      U,
    );

    expect(target?.slotId).toBe("bottom-right");
  });

  it("drops into the third of the 1U row under the pointer", () => {
    const target = detectContainerDropTarget(
      rackWithChassis(),
      [irregularChassis(), smallDevice],
      smallDevice,
      0.5 * U,
      INTERIOR * 0.9,
      RACK_PX,
      3,
      U,
    );

    expect(target?.slotId).toBe("top-right");
  });

  it("highlights the same cell the drop would land in", () => {
    const hover = detectContainerHover(
      rackWithChassis(),
      [irregularChassis(), smallDevice],
      smallDevice,
      0.5 * U,
      INTERIOR * 0.5,
      RACK_PX,
      3,
      U,
    );

    expect(hover?.targetSlotId).toBe("top-mid");
  });
});

describe("irregular container fill order", () => {
  it("fills the bottom row left to right before the row above", () => {
    const chassis = irregularChassis();
    const filled: string[] = [];
    const children: PlacedDevice[] = [];

    for (let i = 0; i < chassis.slots!.length; i++) {
      const next = findNextFreeChildPosition(chassis, children);
      filled.push(next!.slotId);
      children.push(child(`c${i}`, next!.slotId));
    }

    expect(filled).toEqual([
      "bottom-left",
      "bottom-right",
      "top-left",
      "top-mid",
      "top-right",
    ]);
    expect(findNextFreeChildPosition(chassis, children)).toBeNull();
  });

  it("cycles a child through the cells in the same order, wrapping at the end", () => {
    const chassis = irregularChassis();
    const visited: string[] = [];
    let current = "bottom-left";

    for (let i = 0; i < chassis.slots!.length; i++) {
      const next = findNextSlotForChild(
        chassis,
        smallDevice,
        current,
        [],
        RACK_19,
      );
      current = next!.slotId;
      visited.push(current);
    }

    expect(visited).toEqual([
      "bottom-right",
      "top-left",
      "top-mid",
      "top-right",
      "bottom-left",
    ]);
  });
});
