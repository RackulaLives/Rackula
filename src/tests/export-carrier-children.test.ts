/**
 * Image export: carrier children (#3362)
 *
 * A child's position is container-relative, so the export must draw it inside
 * its carrier's cell rather than treating it as a rail-mounted device.
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import {
  BASE_RACK_WIDTH,
  RACK_PADDING_HIDDEN,
  RAIL_WIDTH,
  U_HEIGHT_PX,
} from "$lib/constants/layout";
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
});
