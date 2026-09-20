/**
 * Cell and gap geometry (#3310 follow-up).
 *
 * One function places cells and gaps, so the two renderers and the drop
 * targeting cannot drift apart. A carrier with no slot_gaps must lay out
 * exactly as it did before gaps existed.
 */
import { describe, it, expect } from "vitest";
import {
  slotLayout,
  gapsFor,
  usedMm,
  remainingMm,
  fitsInRow,
} from "$lib/utils/slot-layout";
import { getRackOpeningMm } from "$lib/utils/device-width";
import { colAtX } from "$lib/utils/dragdrop";
import type { DeviceType } from "$lib/types";

const INTERIOR = 186;
const RACK_19 = 19;

function carrier(overrides: Partial<DeviceType> = {}): DeviceType {
  return {
    slug: "c",
    model: "Carrier",
    u_height: 1,
    category: "shelf",
    colour: "#336699",
    slots: [
      { id: "col-1", position: { row: 0, col: 0 }, width_fraction: 0.5 },
      { id: "col-2", position: { row: 0, col: 1 }, width_fraction: 0.5 },
    ],
    ...overrides,
  };
}

describe("slotLayout", () => {
  it("lays a gapless carrier out edge to edge, as before gaps existed", () => {
    const layout = slotLayout(carrier(), INTERIOR, RACK_19);

    expect(layout.slots.map((s) => [s.id, s.x, s.width])).toEqual([
      ["col-1", 0, 93],
      ["col-2", 93, 93],
    ]);
    expect(layout.gaps).toEqual([]);
    expect(layout.free).toBeNull();
  });

  it("pushes the cell after a gap along by the gap's share of the opening", () => {
    const opening = getRackOpeningMm(RACK_19);
    const gapPx = INTERIOR * (20 / opening);
    const layout = slotLayout(
      carrier({
        slots: [
          { id: "col-1", position: { row: 0, col: 0 }, width_fraction: 0.25 },
          { id: "col-2", position: { row: 0, col: 1 }, width_fraction: 0.25 },
        ],
        slot_gaps: [20],
      }),
      INTERIOR,
      RACK_19,
    );

    expect(layout.slots[0]!.x).toBe(0);
    expect(layout.gaps[0]!.x).toBeCloseTo(INTERIOR * 0.25, 5);
    expect(layout.gaps[0]!.width).toBeCloseTo(gapPx, 5);
    expect(layout.gaps[0]!.mm).toBe(20);
    expect(layout.slots[1]!.x).toBeCloseTo(INTERIOR * 0.25 + gapPx, 5);
  });

  it("reports the leftover at the end of the row as free space", () => {
    const layout = slotLayout(
      carrier({
        slots: [
          { id: "col-1", position: { row: 0, col: 0 }, width_fraction: 0.25 },
        ],
      }),
      INTERIOR,
      RACK_19,
    );

    expect(layout.free).toEqual({ x: 46.5, width: 139.5 });
  });

  it("ignores gaps on a multi-row container", () => {
    const grid = carrier({
      slots: [
        { id: "a", position: { row: 0, col: 0 }, width_fraction: 0.5 },
        { id: "b", position: { row: 0, col: 1 }, width_fraction: 0.5 },
        { id: "c", position: { row: 1, col: 0 }, width_fraction: 0.5 },
        { id: "d", position: { row: 1, col: 1 }, width_fraction: 0.5 },
      ],
      slot_gaps: [20, 20, 20],
    });

    expect(gapsFor(grid)).toEqual([]);
    expect(slotLayout(grid, INTERIOR, RACK_19).gaps).toEqual([]);
  });
});

describe("row budget", () => {
  it("counts cells and gaps against the opening", () => {
    const c = carrier({
      slots: [
        { id: "col-1", position: { row: 0, col: 0 }, width_fraction: 0.2 },
        { id: "col-2", position: { row: 0, col: 1 }, width_fraction: 0.2 },
      ],
      slot_gaps: [20],
    });
    const opening = getRackOpeningMm(RACK_19);

    expect(usedMm(c, RACK_19)).toBeCloseTo(opening * 0.4 + 20, 5);
    expect(remainingMm(c, RACK_19)).toBeCloseTo(opening * 0.6 - 20, 5);
  });

  it("refuses an addition that would overflow the row", () => {
    const c = carrier();

    expect(fitsInRow(c, RACK_19, 0)).toBe(true);
    expect(fitsInRow(c, RACK_19, 10)).toBe(false);
  });
});

describe("colAtX with gaps", () => {
  it("returns no column for a point inside a gap", () => {
    const c = carrier({
      slots: [
        { id: "col-1", position: { row: 0, col: 0 }, width_fraction: 0.25 },
        { id: "col-2", position: { row: 0, col: 1 }, width_fraction: 0.25 },
      ],
      slot_gaps: [20],
    });
    const firstCellWidth = INTERIOR * 0.25;

    expect(colAtX(c.slots!, firstCellWidth / 2, INTERIOR, c, RACK_19)).toBe(0);
    expect(
      colAtX(c.slots!, firstCellWidth + 1, INTERIOR, c, RACK_19),
    ).toBeNull();
  });

  it("keeps the gapless answer when no container is passed", () => {
    const c = carrier();

    expect(colAtX(c.slots!, INTERIOR * 0.75, INTERIOR)).toBe(1);
  });
});
