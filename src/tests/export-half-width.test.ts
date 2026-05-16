/**
 * PNG/SVG export — half-width device geometry (#1660)
 *
 * Regression coverage: ensures the export renderer respects `slot_width: 1`
 * and `slot_position` so two half-width devices end up side-by-side instead
 * of overlapping at full width.
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
  TEST_CONSTANTS,
} from "./factories";

const { RAIL_WIDTH, RACK_WIDTH_19 } = TEST_CONSTANTS;
const INTERIOR_WIDTH = RACK_WIDTH_19 - RAIL_WIDTH * 2;

const baseOptions: ExportOptions = {
  format: "png",
  scope: "all",
  includeNames: true,
  includeLegend: false,
  background: "solid",
  exportView: "front",
  displayMode: "label",
};

function rectsWithFill(svg: SVGElement, fill: string) {
  return Array.from(svg.getElementsByTagName("rect")).filter(
    (r) => r.getAttribute("fill") === fill,
  );
}

describe("PNG export — half-width device geometry (#1660)", () => {
  it("places two side-by-side half-width devices in non-overlapping halves of the interior", () => {
    const halfWidth = createTestDeviceType({
      slug: "half-server",
      u_height: 3,
      slot_width: 1,
      is_full_depth: false,
    });

    const rack = createTestRack({
      width: 19,
      devices: [
        createTestDevice({
          id: "left",
          device_type: "half-server",
          position: 10,
          slot_position: "left",
        }),
        createTestDevice({
          id: "right",
          device_type: "half-server",
          position: 10,
          slot_position: "right",
        }),
      ],
    });

    const svg = generateExportSVG([rack], [halfWidth], baseOptions);
    const rects = rectsWithFill(svg, halfWidth.colour!);

    // eslint-disable-next-line no-restricted-syntax -- two placed devices must produce exactly two coloured device rects
    expect(rects).toHaveLength(2);

    const sorted = rects
      .map((r) => ({
        x: Number(r.getAttribute("x")),
        width: Number(r.getAttribute("width")),
      }))
      .sort((a, b) => a.x - b.x);

    expect(sorted[0].width).toBeCloseTo(INTERIOR_WIDTH / 2 - 2);
    expect(sorted[1].width).toBeCloseTo(INTERIOR_WIDTH / 2 - 2);
    expect(sorted[0].x).toBeCloseTo(RAIL_WIDTH + 2);
    expect(sorted[1].x).toBeCloseTo(RAIL_WIDTH + INTERIOR_WIDTH / 2);

    // The two rects must not overlap horizontally.
    expect(sorted[1].x).toBeGreaterThanOrEqual(sorted[0].x + sorted[0].width);
  });

  it("renders a full-width device across the full interior", () => {
    const fullWidth = createTestDeviceType({
      slug: "full-server",
      u_height: 2,
    });
    const rack = createTestRack({
      width: 19,
      devices: [
        createTestDevice({
          id: "fw",
          device_type: "full-server",
          position: 10,
        }),
      ],
    });

    const svg = generateExportSVG([rack], [fullWidth], baseOptions);
    const rects = rectsWithFill(svg, fullWidth.colour!);

    // eslint-disable-next-line no-restricted-syntax -- one placed device must produce exactly one coloured device rect
    expect(rects).toHaveLength(1);
    expect(Number(rects[0].getAttribute("x"))).toBeCloseTo(RAIL_WIDTH + 2);
    expect(Number(rects[0].getAttribute("width"))).toBeCloseTo(
      INTERIOR_WIDTH - 4,
    );
  });

  it('ignores slot_position on a 10" single-slot rack and renders the device full-width', () => {
    const halfWidth = createTestDeviceType({
      slug: "ten-inch",
      u_height: 1,
      slot_width: 1,
    });
    const rack = createTestRack({
      width: 10,
      devices: [
        createTestDevice({
          id: "ten",
          device_type: "ten-inch",
          position: 5,
          slot_position: "right",
        }),
      ],
    });

    const svg = generateExportSVG([rack], [halfWidth], baseOptions);
    const rects = rectsWithFill(svg, halfWidth.colour!);

    // eslint-disable-next-line no-restricted-syntax -- one placed device must produce exactly one coloured device rect
    expect(rects).toHaveLength(1);
    expect(Number(rects[0].getAttribute("x"))).toBeCloseTo(RAIL_WIDTH + 2);
    expect(Number(rects[0].getAttribute("width"))).toBeCloseTo(
      INTERIOR_WIDTH - 4,
    );
  });
});
