/**
 * Image export: carrier children (#3362)
 *
 * A child's position is container-relative, so the export must draw it inside
 * its carrier's cell rather than treating it as a rail-mounted device.
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import {
  BASE_RACK_WIDTH,
  RACK_PADDING_HIDDEN,
  RAIL_WIDTH,
  U_HEIGHT_PX,
} from "$lib/constants/layout";
import { MM_PER_U } from "$lib/types/constants";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
  createTestContainerType,
  createTestContainerChild,
} from "./factories";

const baseOptions: ExportOptions = {
  format: "svg",
  scope: "all",
  includeNames: false,
  includeLegend: false,
  background: "solid",
  displayMode: "label",
  exportView: "front",
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesWithFill(svg: SVGElement, fill: string): Box[] {
  return Array.from(svg.getElementsByTagName("rect"))
    .filter((r) => r.getAttribute("fill") === fill)
    .map((r) => ({
      x: Number(r.getAttribute("x")),
      y: Number(r.getAttribute("y")),
      width: Number(r.getAttribute("width")),
      height: Number(r.getAttribute("height")),
    }));
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

const RACK_HEIGHT = 10;
const carrierType = createTestContainerType({
  slug: "test-carrier",
  u_height: 1,
  colour: "#111111",
  is_full_depth: false,
});
const leftType = createTestDeviceType({
  slug: "left-child",
  u_height: 1,
  colour: "#222222",
  is_full_depth: false,
});
const rightType = createTestDeviceType({
  slug: "right-child",
  u_height: 1,
  colour: "#333333",
  is_full_depth: false,
});
const library = [carrierType, leftType, rightType];

function carrierRack(carrierFace: "front" | "rear" = "front") {
  return createTestRack({
    height: RACK_HEIGHT,
    devices: [
      createTestDevice({
        id: "carrier-1",
        device_type: "test-carrier",
        position: 5,
        face: carrierFace,
      }),
      createTestContainerChild({
        id: "child-left",
        device_type: "left-child",
        container_id: "carrier-1",
        slot_id: "slot-left",
        position: 0,
      }),
      createTestContainerChild({
        id: "child-right",
        device_type: "right-child",
        container_id: "carrier-1",
        slot_id: "slot-right",
        position: 0,
        face: "rear",
      }),
    ],
  });
}

const rackInterior: Box = {
  x: RAIL_WIDTH,
  y: RACK_PADDING_HIDDEN + RAIL_WIDTH,
  width: BASE_RACK_WIDTH - RAIL_WIDTH * 2,
  height: RACK_HEIGHT * U_HEIGHT_PX,
};

describe("image export: carrier children (#3362)", () => {
  it("draws each child inside its carrier and none outside the rack", () => {
    const svg = generateExportSVG([carrierRack()], library, baseOptions);

    const [carrier] = boxesWithFill(svg, carrierType.colour!);
    expect(carrier).toBeDefined();
    const left = boxesWithFill(svg, leftType.colour!);
    const right = boxesWithFill(svg, rightType.colour!);
    const children = [...left, ...right];

    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(contains(carrier!, child)).toBe(true);
      expect(contains(rackInterior, child)).toBe(true);
    }
    // Side-by-side cells: the left child sits left of the right child.
    expect(left[0]!.x + left[0]!.width).toBeLessThanOrEqual(right[0]!.x);
  });

  it("children follow their carrier's face, not their own", () => {
    const frontSvg = generateExportSVG([carrierRack("rear")], library, {
      ...baseOptions,
      exportView: "front",
    });
    const rearSvg = generateExportSVG([carrierRack("rear")], library, {
      ...baseOptions,
      exportView: "rear",
    });

    // The left child is tagged front, but its carrier is rear-mounted.
    // eslint-disable-next-line no-restricted-syntax -- a child of a rear carrier must not appear in the front view
    expect(boxesWithFill(frontSvg, leftType.colour!)).toHaveLength(0);
    const [rearCarrier] = boxesWithFill(rearSvg, carrierType.colour!);
    const rearChildren = [
      ...boxesWithFill(rearSvg, leftType.colour!),
      ...boxesWithFill(rearSvg, rightType.colour!),
    ];
    expect(rearChildren.length).toBeGreaterThan(0);
    for (const child of rearChildren) {
      expect(contains(rearCarrier!, child)).toBe(true);
    }
  });

  it("draws a measured child at its measured height, on the cell floor", () => {
    // A switch 27 mm tall takes 1U, but is drawn 27 mm tall.
    const switchType = createTestDeviceType({
      slug: "measured-child",
      u_height: 1,
      width_mm: 158,
      height_mm: 27,
      colour: "#444444",
      is_full_depth: false,
    });
    const rack = carrierRack();
    rack.devices[1] = { ...rack.devices[1]!, device_type: "measured-child" };
    const svg = generateExportSVG(
      [rack],
      [...library, switchType],
      baseOptions,
    );

    const [measured] = boxesWithFill(svg, switchType.colour!);
    const [fullHeight] = boxesWithFill(svg, rightType.colour!);
    expect(measured!.height).toBeCloseTo((27 / MM_PER_U) * U_HEIGHT_PX - 2);
    expect(measured!.y + measured!.height).toBeCloseTo(
      fullHeight!.y + fullHeight!.height,
    );
  });

  it("keeps a very thin measured child a positive box inside its cell", () => {
    // 0.1 mm is drawn well under 2 px, so a fixed 1 px inset would invert it.
    const thinType = createTestDeviceType({
      slug: "thin-child",
      u_height: 0.5,
      width_mm: 158,
      height_mm: 0.1,
      colour: "#555555",
      is_full_depth: false,
    });
    const rack = carrierRack();
    rack.devices[1] = { ...rack.devices[1]!, device_type: "thin-child" };
    const svg = generateExportSVG([rack], [...library, thinType], baseOptions);

    const [thin] = boxesWithFill(svg, thinType.colour!);
    const [carrier] = boxesWithFill(svg, carrierType.colour!);
    // The carrier body is inset 1 px; its footprint is its full rack height.
    const footprint = {
      ...carrier!,
      y: carrier!.y - 1,
      height: carrier!.height + 2,
    };
    expect(thin!.height).toBeGreaterThan(0);
    expect(contains(footprint, thin!)).toBe(true);
  });

  it("keeps a very thin measured child's label no taller than its box", () => {
    const thinType = createTestDeviceType({
      slug: "thin-child",
      u_height: 0.5,
      width_mm: 158,
      height_mm: 0.1,
      colour: "#555555",
      is_full_depth: false,
    });
    const rack = carrierRack();
    rack.devices[1] = {
      ...rack.devices[1]!,
      device_type: "thin-child",
      name: "Thin",
    };
    const svg = generateExportSVG([rack], [...library, thinType], baseOptions);

    const [thin] = boxesWithFill(svg, thinType.colour!);
    const label = Array.from(svg.getElementsByTagName("text")).find(
      (el) => el.textContent === "Thin",
    );
    expect(Number(label!.getAttribute("font-size"))).toBeLessThanOrEqual(
      thin!.height,
    );
  });

  it("draws a turned measured child at its turned height", () => {
    // 40 mm wide and 20 mm tall, turned on its side: it stands 40 mm tall.
    const turnedType = createTestDeviceType({
      slug: "turned-child",
      u_height: 0.5,
      width_mm: 40,
      height_mm: 20,
      colour: "#666666",
      is_full_depth: false,
    });
    const rack = carrierRack();
    rack.devices[1] = {
      ...rack.devices[1]!,
      device_type: "turned-child",
      rotation: 90,
    };
    const svg = generateExportSVG(
      [rack],
      [...library, turnedType],
      baseOptions,
    );

    const [turned] = boxesWithFill(svg, turnedType.colour!);
    expect(turned!.height).toBeCloseTo((40 / MM_PER_U) * U_HEIGHT_PX - 2);
  });

  describe("child images", () => {
    const imageOptions: ExportOptions = {
      ...baseOptions,
      displayMode: "image",
    };
    const measuredType = createTestDeviceType({
      slug: "imaged-child",
      u_height: 1,
      width_mm: 40,
      height_mm: 27,
      colour: "#777777",
      is_full_depth: false,
    });
    const images: ImageStoreMap = new Map([
      [
        "imaged-child",
        {
          front: {
            dataUrl: "data:image/png;base64,CHILD",
            filename: "child.png",
          },
        },
      ],
    ]);

    function childImage(rotation?: 90) {
      const rack = carrierRack();
      rack.devices[1] = {
        ...rack.devices[1]!,
        device_type: "imaged-child",
        rotation,
      };
      const svg = generateExportSVG(
        [rack],
        [...library, measuredType],
        imageOptions,
        images,
      );
      const image = Array.from(svg.getElementsByTagName("image")).find(
        (el) => el.getAttribute("href") === "data:image/png;base64,CHILD",
      );
      return {
        width: Number(image!.getAttribute("width")),
        height: Number(image!.getAttribute("height")),
        transform: image!.getAttribute("transform"),
      };
    }

    it("fills the child's whole drawn box, as the canvas does", () => {
      const image = childImage();
      expect(image.height).toBeCloseTo((27 / MM_PER_U) * U_HEIGHT_PX);
      expect(image.transform).toBeNull();
    });

    it("lays a turned child's image flat and turns it with the child", () => {
      // Turned, the child stands 40 mm tall; its image is laid out 40 mm
      // wide, then turned into the box.
      const image = childImage(90);
      expect(image.width).toBeCloseTo((40 / MM_PER_U) * U_HEIGHT_PX);
      expect(image.transform).toContain("rotate(90");
    });
  });
});
