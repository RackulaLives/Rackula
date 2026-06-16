/**
 * Slot-move logic (#2322): picking the next cell a half-width contained device
 * can shuffle to within its own carrier. The control cycles a child between the
 * carrier's cells without ever ejecting it, so this is pure cell selection over
 * the carrier-cell model (#2158), not a rack-level move.
 */

import { describe, it, expect } from "vitest";
import { findNextSlotForChild } from "$lib/utils/collision";
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

    const next = findNextSlotForChild(carrier, child, "col-1", []);

    expect(next).toEqual({ slotId: "col-2" });
  });

  it("wraps from the last cell back to the first free cell", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();

    const next = findNextSlotForChild(carrier, child, "col-2", []);

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
    const next = findNextSlotForChild(carrier, child, "c1", [sibling]);

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

    const next = findNextSlotForChild(carrier, child, "col-1", [sibling]);

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

    const next = findNextSlotForChild(carrier, child, "only", []);

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
    const fromWide = findNextSlotForChild(carrier, fullWidthChild, "wide", []);
    expect(fromWide).toBeNull();
  });

  it("returns null when the current slot is not part of the carrier", () => {
    const carrier = twoColCarrier();
    const child = halfWidthChild();

    const next = findNextSlotForChild(carrier, child, "nonexistent", []);

    expect(next).toBeNull();
  });
});
