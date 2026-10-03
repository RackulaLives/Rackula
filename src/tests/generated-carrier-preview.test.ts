/**
 * The preview over a generated carrier agrees with the placement.
 *
 * A generated carrier grows a cell for a device dropped on it, as long as the
 * row has width left for the device as it stands and the carrier is tall
 * enough. The preview says so: valid when the carrier can grow, blocked when
 * the store would refuse.
 */
import { describe, it, expect, vi } from "vitest";

// Control the resolved SVG coordinate without a real DOM geometry.
vi.mock("$lib/utils/coordinates", async (importActual) => {
  const actual = await importActual<typeof import("$lib/utils/coordinates")>();
  return { ...actual, screenToSVG: vi.fn(() => ({ x: 100, y: 200 })) };
});

import {
  resolveDropTarget,
  type RackDimensions,
  type DropCoordinateInput,
} from "$lib/utils/rack-drop-coordinator";
import { buildCustomCarrierType } from "$lib/utils/custom-carrier";
import { getRackOpeningMm, orientDeviceType } from "$lib/utils/device-width";
import type { DeviceType } from "$lib/types";
import {
  createTestContainerChild,
  createTestDevice,
  createTestDeviceType,
  createTestRack,
} from "./factories";

const dims: RackDimensions = {
  rackHeight: 12,
  rackWidth: 220,
  interiorWidth: 220 - 17 * 2,
  uHeight: 22,
  rackPadding: 0,
  railWidth: 17,
};
// The mocked SVG y of 200 resolves to U4, the carrier's bottom U.
const coords: DropCoordinateInput = {
  svgElement: {} as SVGSVGElement,
  clientX: 100,
  clientY: 200,
};

/** A mini PC lying flat: 179 mm wide, 34.5 mm tall. */
const miniPc = createTestDeviceType({
  slug: "mini-pc",
  u_height: 1,
  width_mm: 179,
  height_mm: 34.5,
});
/** A small box, 72 mm wide, 44.5 mm tall. */
const smallBox = createTestDeviceType({
  slug: "small-box",
  u_height: 1,
  width_mm: 72,
  height_mm: 44.5,
});

/** A 10" rack with a generated carrier at U4 whose cells are `cellsMm` wide. */
function rackWithCarrier(cellsMm: number[], uHeight = 5) {
  const opening = getRackOpeningMm(10);
  const carrierType = buildCustomCarrierType(
    uHeight,
    cellsMm.map((mm) => ({ widthFraction: mm / opening, heightUnits: 1 })),
    cellsMm.slice(1).map(() => 0),
  );
  const carrier = createTestDevice({
    id: "carrier",
    device_type: carrierType.slug,
    position: 4,
  });
  const children = cellsMm.map((_, i) =>
    createTestContainerChild({
      container_id: "carrier",
      slot_id: `col-${i + 1}`,
      device_type: "small-box",
    }),
  );
  const rack = createTestRack({
    height: 12,
    width: 10,
    devices: [carrier, ...children],
  });
  return { rack, library: [carrierType, miniPc, smallBox] };
}

function previewOver(
  cellsMm: number[],
  device: DeviceType,
  carrierU = 5,
): string {
  const { rack, library } = rackWithCarrier(cellsMm, carrierU);
  return resolveDropTarget(coords, dims, rack, library, device, "front")
    .feedback;
}

describe("preview over a generated carrier", () => {
  it("is valid when the row has width left for the device on its side", () => {
    expect(previewOver([34.5], orientDeviceType(miniPc, 90))).toBe("valid");
  });

  it("is blocked when the row has no width left for the device", () => {
    // 222.25 mm opening, 3 x 72 mm used: 6.25 mm left, 72 mm needed.
    expect(previewOver([72, 72, 72], smallBox)).toBe("blocked");
  });

  it("is blocked when the device is taller than the carrier", () => {
    // On its side the mini PC takes 4.5U, more than a 1U carrier.
    expect(previewOver([72], orientDeviceType(miniPc, 90), 1)).toBe("blocked");
  });
});
