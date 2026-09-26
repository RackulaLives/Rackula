/**
 * Slot-move logic (#2322): picking the next cell a half-width contained device
 * can shuffle to within its own carrier. The control cycles a child between the
 * carrier's cells without ever ejecting it, so this is pure cell selection over
 * the carrier-cell model (#2158), not a rack-level move.
 */

import { describe, it, expect } from "vitest";
import {
  findAdjacentSlotForChild,
  findNextSlotForChild,
} from "$lib/utils/collision";
import {
  createTestDeviceType,
  createTestContainerType,
  createTestContainerChild,
  createTestSlot,
} from "./factories";

// A half-width 2-column carrier: two equal cells side by side.
function twoColCarrier() {
  return createTestContainerType({
    slug: "carrier-2col",
    u_height: 1,
    slots: [
      createTestSlot({
        id: "col-1",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 1,
      }),
      createTestSlot({
        id: "col-2",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 1,
      }),
    ],
  });
}

// A half-width device that fits any 0.5-fraction cell.
function halfWidthChild() {
  return createTestDeviceType({
    slug: "half-server",
    u_height: 1,
    slot_width: 1,
  });
}

describe("findNextSlotForChild", () => {
  it("returns the other free cell when a 2-cell carrier has only the child", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();

    const next = findNextSlotForChild(carrier, child, "col-1", [], 19);

    expect(next).toEqual({ slotId: "col-2" });
  });

  it("wraps from the last cell back to the first free cell", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();

    const next = findNextSlotForChild(carrier, child, "col-2", [], 19);

    expect(next).toEqual({ slotId: "col-1" });
  });

  it("skips a cell occupied by a sibling and lands on the next free one", () => {
    const carrier = createTestContainerType({
      slug: "carrier-3col",
      u_height: 1,
      slots: [
        createTestSlot({ id: "c1", width_fraction: 0.5, height_units: 1 }),
        createTestSlot({ id: "c2", width_fraction: 0.5, height_units: 1 }),
        createTestSlot({ id: "c3", width_fraction: 0.5, height_units: 1 }),
      ],
    });
    const child = halfWidthChild();
    const sibling = createTestContainerChild({
      container_id: "carrier-1",
      slot_id: "c2",
      device_type: "half-server",
    });

    // From c1, c2 is taken by the sibling, so the next reachable cell is c3.
    const next = findNextSlotForChild(carrier, child, "c1", [sibling], 19);

    expect(next).toEqual({ slotId: "c3" });
  });

  it("returns null when every other cell is occupied by siblings", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();
    const sibling = createTestContainerChild({
      container_id: "carrier-1",
      slot_id: "col-2",
      device_type: "half-server",
    });

    const next = findNextSlotForChild(carrier, child, "col-1", [sibling], 19);

    expect(next).toBeNull();
  });

  it("returns null for a single-cell carrier (nowhere else to go)", () => {
    const carrier = createTestContainerType({
      slug: "carrier-1cell",
      u_height: 1,
      slots: [
        createTestSlot({ id: "only", width_fraction: 1, height_units: 1 }),
      ],
    });
    const child = createTestDeviceType({ slug: "full", u_height: 1 });

    const next = findNextSlotForChild(carrier, child, "only", [], 19);

    expect(next).toBeNull();
  });

  it("skips a cell the child does not fit (width) and finds one it does", () => {
    // A device needing full width cannot occupy a 0.5 cell, but can occupy a
    // full-width cell further along the carrier.
    const carrier = createTestContainerType({
      slug: "carrier-mixed",
      u_height: 1,
      slots: [
        createTestSlot({ id: "narrow", width_fraction: 0.5, height_units: 1 }),
        createTestSlot({ id: "wide", width_fraction: 1, height_units: 1 }),
      ],
    });
    const fullWidthChild = createTestDeviceType({
      slug: "full",
      u_height: 1,
      slot_width: 2,
    });

    // Currently in the wide cell; the only other cell (narrow) does not fit.
    const fromWide = findNextSlotForChild(
      carrier,
      fullWidthChild,
      "wide",
      [],
      19,
    );
    expect(fromWide).toBeNull();
  });

  it("returns null when the current slot is not part of the carrier", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();

    const next = findNextSlotForChild(carrier, child, "nonexistent", [], 19);

    expect(next).toBeNull();
  });
});

// A 2x2 carrier: row 0 is the bottom row, so "up" is a higher row.
function twoByTwoCarrier() {
  const cell = (row: number, col: number) =>
    createTestSlot({
      id: `r${row}-c${col}`,
      position: { row, col },
      width_fraction: 0.5,
      height_units: 0.5,
    });
  return createTestContainerType({
    slug: "carrier-2x2",
    u_height: 1,
    slots: [cell(0, 0), cell(0, 1), cell(1, 0), cell(1, 1)],
  });
}

function subUHalfChild() {
  return createTestDeviceType({
    slug: "half-sub-u",
    u_height: 0.5,
    slot_width: 1,
  });
}

function siblingIn(slotId: string) {
  return createTestContainerChild({
    container_id: "carrier-1",
    slot_id: slotId,
    device_type: "half-server",
  });
}

describe("findAdjacentSlotForChild (#2295)", () => {
  it("moves right to the next column in the same row", () => {
    expect(
      findAdjacentSlotForChild(
        twoColCarrier(),
        halfWidthChild(),
        "col-1",
        [],
        "right",
        19,
      ),
    ).toEqual({ slotId: "col-2" });
  });

  it("moves left to the previous column in the same row", () => {
    expect(
      findAdjacentSlotForChild(
        twoColCarrier(),
        halfWidthChild(),
        "col-2",
        [],
        "left",
        19,
      ),
    ).toEqual({ slotId: "col-1" });
  });

  it("moves up to the cell above in the same column", () => {
    expect(
      findAdjacentSlotForChild(
        twoByTwoCarrier(),
        subUHalfChild(),
        "r0-c1",
        [],
        "up",
        19,
      ),
    ).toEqual({ slotId: "r1-c1" });
  });

  it("moves down to the cell below in the same column", () => {
    expect(
      findAdjacentSlotForChild(
        twoByTwoCarrier(),
        subUHalfChild(),
        "r1-c0",
        [],
        "down",
        19,
      ),
    ).toEqual({ slotId: "r0-c0" });
  });

  it("returns null at the edge of the carrier, never wrapping", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();

    expect(
      findAdjacentSlotForChild(carrier, child, "col-2", [], "right", 19),
    ).toBeNull();
    expect(
      findAdjacentSlotForChild(carrier, child, "col-1", [], "up", 19),
    ).toBeNull();
  });

  it("leapfrogs an occupied cell to the next free one in that direction", () => {
    const carrier = createTestContainerType({
      slug: "carrier-3col",
      u_height: 1,
      slots: [0, 1, 2].map((col) =>
        createTestSlot({
          id: `c${col}`,
          position: { row: 0, col },
          width_fraction: 0.5,
          height_units: 1,
        }),
      ),
    });

    expect(
      findAdjacentSlotForChild(
        carrier,
        halfWidthChild(),
        "c0",
        [siblingIn("c1")],
        "right",
        19,
      ),
    ).toEqual({ slotId: "c2" });
  });

  it("returns null when every cell that way is taken", () => {
    expect(
      findAdjacentSlotForChild(
        twoColCarrier(),
        halfWidthChild(),
        "col-1",
        [siblingIn("col-2")],
        "right",
        19,
      ),
    ).toBeNull();
  });
});
