/**
 * Tests for the container cell geometry helper (#3341). Each cell of a
 * carrier must sit inside the carrier: x accumulates within the cell's own row
 * in column order, and y comes from the row, with row 0 at the bottom.
 */
import { describe, it, expect } from "vitest";
import { getChildYInSlot, getSlotRects } from "$lib/utils/slot-geometry";
import { getStarterLibrary } from "$lib/data/starterLibrary";
import { colAtX, rowAtY } from "$lib/utils/dragdrop";
import type { Slot } from "$lib/types";
import { createTestSlot } from "./factories";

const U = 20;
const WIDTH = 400;

function cells2x2() {
  return [
    createTestSlot({
      id: "r0-c0",
      position: { row: 0, col: 0 },
      width_fraction: 0.5,
      height_units: 0.5,
    }),
    createTestSlot({
      id: "r0-c1",
      position: { row: 0, col: 1 },
      width_fraction: 0.5,
      height_units: 0.5,
    }),
    createTestSlot({
      id: "r1-c0",
      position: { row: 1, col: 0 },
      width_fraction: 0.5,
      height_units: 0.5,
    }),
    createTestSlot({
      id: "r1-c1",
      position: { row: 1, col: 1 },
      width_fraction: 0.5,
      height_units: 0.5,
    }),
  ];
}

describe("getSlotRects", () => {
  it("places a 2x2 carrier's top row above its bottom row, inside the carrier", () => {
    const rects = getSlotRects(cells2x2(), WIDTH, U);

    expect(rects.get("r0-c0")).toEqual({ x: 0, y: 10, width: 200, height: 10 });
    expect(rects.get("r0-c1")).toEqual({
      x: 200,
      y: 10,
      width: 200,
      height: 10,
    });
    expect(rects.get("r1-c0")).toEqual({ x: 0, y: 0, width: 200, height: 10 });
    expect(rects.get("r1-c1")).toEqual({
      x: 200,
      y: 0,
      width: 200,
      height: 10,
    });
  });

  it("lays out cells by row and column, not by array order", () => {
    const ordered = getSlotRects(cells2x2(), WIDTH, U);
    const [a, b, c, d] = cells2x2();
    const shuffled = getSlotRects([d!, b!, c!, a!], WIDTH, U);

    expect(shuffled).toEqual(ordered);
  });

  it("keeps a single-row 1x2 carrier's cells side by side at full height", () => {
    const slots = [
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
    ];

    const rects = getSlotRects(slots, WIDTH, U);

    expect(rects.get("col-1")).toEqual({ x: 0, y: 0, width: 200, height: 20 });
    expect(rects.get("col-2")).toEqual({
      x: 200,
      y: 0,
      width: 200,
      height: 20,
    });
  });

  it("keeps a single-row cell within the carrier when height_units spans several U", () => {
    const slots = [
      createTestSlot({
        id: "col-1",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
      }),
    ];

    const rects = getSlotRects(slots, WIDTH, 2 * U);

    expect(rects.get("col-1")).toEqual({ x: 0, y: 0, width: 200, height: 40 });
  });
});

describe("getChildYInSlot", () => {
  it("puts a child in a top-row cell in the top half of a 2x2 carrier", () => {
    const rects = getSlotRects(cells2x2(), WIDTH, U);

    expect(getChildYInSlot(rects.get("r1-c0")!, U, 0, 0.5, U)).toBe(0);
    expect(getChildYInSlot(rects.get("r0-c0")!, U, 0, 0.5, U)).toBe(10);
  });

  it("measures a single-row child's position from the container bottom", () => {
    const slots = [createTestSlot({ id: "bay", height_units: 2 })];
    const cell = getSlotRects(slots, WIDTH, 2 * U).get("bay")!;

    expect(getChildYInSlot(cell, 2 * U, 0, 1, U)).toBe(20);
    expect(getChildYInSlot(cell, 2 * U, 1, 1, U)).toBe(0);
  });

  it("keeps a child in its own row when its position points at another row", () => {
    // 4U chassis with two rows of 2U bays; position is measured from the
    // container bottom, so position 2 is the bottom of the top row.
    const slots = [
      createTestSlot({ id: "low", position: { row: 0, col: 0 } }),
      createTestSlot({ id: "high", position: { row: 1, col: 0 } }),
    ];
    const rects = getSlotRects(slots, WIDTH, 4 * U);

    expect(getChildYInSlot(rects.get("high")!, 4 * U, 2, 2, U)).toBe(0);
    expect(getChildYInSlot(rects.get("high")!, 4 * U, 0, 2, U)).toBe(0);
    expect(getChildYInSlot(rects.get("low")!, 4 * U, 2, 2, U)).toBe(40);
  });

  it("keeps a child taller than its cell inside the container", () => {
    const rects = getSlotRects(cells2x2(), WIDTH, U);

    expect(getChildYInSlot(rects.get("r1-c0")!, U, 0, 1, U)).toBe(0);
    expect(getChildYInSlot(rects.get("r0-c0")!, U, 0, 1, U)).toBe(0);
  });
});

describe("sparse row ids", () => {
  it("stacks rows 0 and 2 as the lower and upper halves", () => {
    const slots = [
      createTestSlot({ id: "low", position: { row: 0, col: 0 } }),
      createTestSlot({ id: "high", position: { row: 2, col: 0 } }),
    ];

    const rects = getSlotRects(slots, WIDTH, U);

    expect(rects.get("low")).toEqual({ x: 0, y: 10, width: 400, height: 10 });
    expect(rects.get("high")).toEqual({ x: 0, y: 0, width: 400, height: 10 });
  });
});

describe("hit-testing matches rendering on regular grids", () => {
  // Drop targeting (detectContainerDropTarget / detectContainerHover) and the
  // child drag guard (isPointerOverCell in RackDevice) resolve a cell with
  // colAtX + rowAtY and a lookup by (col, row). Aiming at the centre of each
  // drawn cell must resolve that same cell. Grids whose rows have different
  // columns or widths are not covered yet (#3342).
  function cellAt(slots: Slot[], heightU: number, x: number, y: number) {
    // Container at U1 in a rack exactly its height, so its top edge is y 0.
    const col = colAtX(slots, x, WIDTH);
    const row = rowAtY(slots, y, heightU, U, 1, heightU);
    return slots.find((s) => s.position.col === col && s.position.row === row)
      ?.id;
  }

  const cases: { name: string; heightU: number; slots: Slot[] }[] = [
    { name: "2x2", heightU: 1, slots: cells2x2() },
    {
      name: "sparse rows 0 and 2",
      heightU: 1,
      slots: [
        createTestSlot({ id: "low", position: { row: 0, col: 0 } }),
        createTestSlot({ id: "high", position: { row: 2, col: 0 } }),
      ],
    },
    {
      name: "single row with id 1",
      heightU: 1,
      slots: [
        createTestSlot({
          id: "a",
          position: { row: 1, col: 0 },
          width_fraction: 0.5,
        }),
        createTestSlot({
          id: "b",
          position: { row: 1, col: 1 },
          width_fraction: 0.5,
        }),
      ],
    },
    {
      name: "columns declared right to left",
      heightU: 1,
      slots: [...cells2x2()].reverse(),
    },
    ...getStarterLibrary()
      .filter((d) => d.slots?.length)
      .map((d) => ({ name: d.slug, heightU: d.u_height, slots: d.slots! })),
  ];

  it.each(cases)("$name", ({ heightU, slots }) => {
    const rects = getSlotRects(slots, WIDTH, heightU * U);

    for (const slot of slots) {
      const cell = rects.get(slot.id)!;
      const x = cell.x + cell.width / 2;
      const y = cell.y + cell.height / 2;
      expect(cellAt(slots, heightU, x, y)).toBe(slot.id);
    }
  });

  it.each([
    {
      name: "multi-row",
      slots: [
        createTestSlot({ id: "low", position: { row: 0, col: 0 } }),
        createTestSlot({ id: "high", position: { row: 2, col: 0 } }),
      ],
    },
    {
      name: "single-row",
      slots: [createTestSlot({ id: "only", position: { row: 0, col: 0 } })],
    },
  ])(
    "aims at no cell in a $name container when the pointer is not a finite position",
    ({ slots }) => {
      const row = rowAtY(slots, Number.NaN, 1, U, 1, 1);

      expect(slots.find((s) => s.position.row === row)).toBeUndefined();
    },
  );
});

describe("starter library containers", () => {
  it("draw every cell inside the container without overlapping", () => {
    const containers = getStarterLibrary().filter((d) => d.slots?.length);
    expect(containers.length).toBeGreaterThan(0);

    for (const container of containers) {
      const height = container.u_height * U;
      const cells = [...getSlotRects(container.slots!, WIDTH, height).values()];
      const eps = 0.001;

      for (const cell of cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.width).toBeLessThanOrEqual(WIDTH + eps);
        expect(cell.y + cell.height).toBeLessThanOrEqual(height + eps);
      }

      cells.forEach((a, i) => {
        for (const b of cells.slice(i + 1)) {
          const apart =
            a.x + a.width <= b.x + eps ||
            b.x + b.width <= a.x + eps ||
            a.y + a.height <= b.y + eps ||
            b.y + b.height <= a.y + eps;
          expect(apart, `${container.slug} cells overlap`).toBe(true);
        }
      });
    }
  });
});
