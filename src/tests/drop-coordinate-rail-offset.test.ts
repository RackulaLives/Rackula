/**
 * A drop lands on the U the cursor is over.
 *
 * The rack's U grid is drawn from `rackPadding + railWidth` down: RackFrame
 * puts row i at `i * uHeight + rackPadding + railWidth`, and RackDropZone
 * places a device at the same origin. resolveCoordinates has to undo that same
 * offset to turn a pointer position back into a U, the way it already undoes
 * the left rail on the x axis (`svgCoords.x - railWidth`).
 *
 * Dropping the top rail's worth of pixels (17 of every 22) resolved one U too
 * low, so aiming at the free cell of a carrier synthesised a second carrier in
 * the U below instead of filling the cell.
 *
 * The device here is half-width rather than measured: the offset is in the
 * coordinate maths, and a half-width device takes the same carrier path in
 * every branch.
 */
import { describe, it, expect } from "vitest";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { CARRIER_2COL_SLUG } from "$lib/utils/collision";
import { toInternalUnits } from "$lib/utils/position";
import {
  resolveDropAction,
  resolveDropTarget,
  type RackDimensions,
} from "$lib/utils/rack-drop-coordinator";
import type { DragData } from "$lib/utils/dragdrop";
import { createTestRack, createTestDeviceType } from "./factories";

const RACK_HEIGHT = 12;
const U_PX = 22;
const RAIL = 17;
const PAD = 18;
const RACK_PX = 220;

const dims: RackDimensions = {
  rackHeight: RACK_HEIGHT,
  rackWidth: RACK_PX,
  interiorWidth: RACK_PX - RAIL * 2,
  uHeight: U_PX,
  rackPadding: PAD,
  railWidth: RAIL,
};

/** The y RackFrame draws the middle of U `u` at (grid origin = PAD + RAIL). */
const yForU = (u: number) => PAD + RAIL + (RACK_HEIGHT - u) * U_PX + U_PX / 2;

/** The x of the middle of a carrier column, matching xOffsetInRack's origin. */
const xForColumn = (col: 1 | 2) =>
  RAIL + dims.interiorWidth * (col === 1 ? 0.25 : 0.75);

/** An SVG at the viewport origin with no viewBox, so client y maps to svg y. */
const svgElement = {
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
  viewBox: { baseVal: { width: 0, height: 0 } },
} as unknown as SVGSVGElement;

const carrierType = findStarterDevice(CARRIER_2COL_SLUG)!;
const halfWidth = createTestDeviceType({
  slug: "mini-switch",
  model: "Mini Switch",
  u_height: 1,
  category: "network",
  slot_width: 1,
});
const deviceLibrary = [carrierType, halfWidth];
const dragData: DragData = { type: "palette", device: halfWidth };

/** A 12U rack with a 2-column carrier at U5, its left cell already taken. */
function rackWithCarrierAtU5() {
  return createTestRack({
    height: RACK_HEIGHT,
    devices: [
      {
        id: "carrier-1",
        device_type: CARRIER_2COL_SLUG,
        position: toInternalUnits(5),
        face: "both",
      },
      {
        id: "child-1",
        device_type: halfWidth.slug,
        position: 0,
        face: "both",
        container_id: "carrier-1",
        slot_id: "col-1",
      },
    ],
  });
}

describe("drop coordinates account for the top rail", () => {
  it("drops into the free cell of the carrier the cursor is over", () => {
    const action = resolveDropAction(
      { svgElement, clientX: xForColumn(2), clientY: yForU(5) },
      dims,
      rackWithCarrierAtU5(),
      deviceLibrary,
      dragData,
      "front",
    );

    expect(action.kind).toBe("container-drop");
    if (action.kind !== "container-drop") return;
    expect(action.containerTarget.containerId).toBe("carrier-1");
    expect(action.containerTarget.slotId).toBe("col-2");
  });

  it("resolves an empty-rail drop to the U under the cursor", () => {
    const empty = createTestRack({ height: RACK_HEIGHT, devices: [] });

    for (const u of [1, 5, 8, RACK_HEIGHT]) {
      const action = resolveDropAction(
        { svgElement, clientX: xForColumn(1), clientY: yForU(u) },
        dims,
        empty,
        deviceLibrary,
        dragData,
        "front",
      );
      expect(action.kind).toBe("carrier-drop");
      if (action.kind !== "carrier-drop") return;
      expect(action.targetU).toBe(u);
    }
  });

  it("previews the U under the cursor", () => {
    const preview = resolveDropTarget(
      { svgElement, clientX: xForColumn(1), clientY: yForU(7) },
      dims,
      createTestRack({ height: RACK_HEIGHT, devices: [] }),
      deviceLibrary,
      halfWidth,
      "front",
    );

    expect(preview.targetU).toBe(7);
  });
});
