/**
 * PNG/SVG export — face filtering (#1681)
 *
 * Regression coverage: ensures the export renderer respects each placed
 * device's `face` field so that "front" devices stay out of the rear view
 * (and vice versa), matching the live builder preview in Rack.svelte.
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

const baseOptions: Omit<ExportOptions, "exportView"> = {
  format: "png",
  scope: "all",
  includeNames: true,
  includeLegend: false,
  background: "solid",
  displayMode: "label",
};

// Devices are rendered as <rect> elements coloured with the device type's
// `colour` value, so filtering rects by fill counts how many of a given
// device type made it into the rendered view.
function rectsWithFill(svg: SVGElement, fill: string) {
  return Array.from(svg.getElementsByTagName("rect")).filter(
    (r) => r.getAttribute("fill") === fill,
  );
}

describe("PNG export — face filtering (#1681)", () => {
  it("hides a front-mounted device from the rear export view", () => {
    const deviceType = createTestDeviceType({
      slug: "front-only-server",
      u_height: 2,
      is_full_depth: true,
    });

    const rack = createTestRack({
      devices: [
        createTestDevice({
          id: "front-1",
          device_type: "front-only-server",
          position: 10,
          face: "front",
        }),
      ],
    });

    const rearSvg = generateExportSVG([rack], [deviceType], {
      ...baseOptions,
      exportView: "rear",
    });

    // eslint-disable-next-line no-restricted-syntax -- face filter must exclude opposite-face devices entirely
    expect(rectsWithFill(rearSvg, deviceType.colour!)).toHaveLength(0);
  });

  it("renders a both-face device in both front and rear export views", () => {
    const deviceType = createTestDeviceType({
      slug: "both-face-server",
      u_height: 2,
      is_full_depth: true,
    });

    const rack = createTestRack({
      devices: [
        createTestDevice({
          id: "both-1",
          device_type: "both-face-server",
          position: 10,
          face: "both",
        }),
      ],
    });

    const frontSvg = generateExportSVG([rack], [deviceType], {
      ...baseOptions,
      exportView: "front",
    });
    const rearSvg = generateExportSVG([rack], [deviceType], {
      ...baseOptions,
      exportView: "rear",
    });

    // eslint-disable-next-line no-restricted-syntax -- one both-face placement must produce exactly one rect per view
    expect(rectsWithFill(frontSvg, deviceType.colour!)).toHaveLength(1);
    // eslint-disable-next-line no-restricted-syntax -- one both-face placement must produce exactly one rect per view
    expect(rectsWithFill(rearSvg, deviceType.colour!)).toHaveLength(1);
  });

  it("hides a rear-mounted device from the front export view", () => {
    const deviceType = createTestDeviceType({
      slug: "rear-only-pdu",
      u_height: 1,
      is_full_depth: true,
    });

    const rack = createTestRack({
      devices: [
        createTestDevice({
          id: "rear-1",
          device_type: "rear-only-pdu",
          position: 5,
          face: "rear",
        }),
      ],
    });

    const frontSvg = generateExportSVG([rack], [deviceType], {
      ...baseOptions,
      exportView: "front",
    });

    // eslint-disable-next-line no-restricted-syntax -- face filter must exclude opposite-face devices entirely
    expect(rectsWithFill(frontSvg, deviceType.colour!)).toHaveLength(0);
  });
});
