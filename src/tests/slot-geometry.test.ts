import { describe, expect, it } from "vitest";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { buildSlotGeometry } from "$lib/utils/slot-geometry";

describe("slot geometry", () => {
  it("lays out 2x2 carrier slots by row and column", () => {
    const carrier = findStarterDevice("carrier-1u-2x2")!;

    const geometry = buildSlotGeometry(carrier.slots!, 200, 40);

    expect(geometry.get("r0-c0")).toMatchObject({
      x: 0,
      y: 20,
      width: 100,
      height: 20,
    });
    expect(geometry.get("r0-c1")).toMatchObject({
      x: 100,
      y: 20,
      width: 100,
      height: 20,
    });
    expect(geometry.get("r1-c0")).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
    });
    expect(geometry.get("r1-c1")).toMatchObject({
      x: 100,
      y: 0,
      width: 100,
      height: 20,
    });
  });

  it("keeps single-row slots horizontal", () => {
    const shelf = findStarterDevice("shelf-1u-2slot")!;

    const geometry = buildSlotGeometry(shelf.slots!, 200, 40);

    expect(geometry.get("left")).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    });
    expect(geometry.get("right")).toMatchObject({
      x: 100,
      y: 0,
      width: 100,
      height: 40,
    });
  });
});
