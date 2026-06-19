/**
 * Export placement images (#1902)
 *
 * Placement images (custom front/rear photos keyed by `placement-{id}`) render
 * in the editor (RackDevice.svelte) but were dropped from exports because the
 * export renderer only looked images up by device-type slug. These tests pin the
 * placement-first, per-face lookup that mirrors the editor.
 */

import { describe, it, expect } from "vitest";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

const baseOptions: ExportOptions = {
  format: "png",
  scope: "all",
  includeNames: true,
  includeLegend: false,
  background: "solid",
  displayMode: "image",
};

// Collects rendered image hrefs, keeping only data URLs. The test fixtures use
// data: URLs exclusively, so this isolates the placement/slug images under test
// from any bundled (static-path) images.
function imageHrefs(svg: SVGElement): string[] {
  return Array.from(svg.getElementsByTagName("image"))
    .map((el) => el.getAttribute("href") ?? "")
    .filter((href) => href.startsWith("data:"));
}

describe("export placement images (#1902)", () => {
  it("renders a placement image in the export, not just the device-type image", () => {
    const deviceType = createTestDeviceType({
      slug: "test-device",
      u_height: 2,
      is_full_depth: true,
    });
    const placed = createTestDevice({
      id: "dev-1",
      device_type: "test-device",
      position: 10,
      face: "both",
    });
    const rack = createTestRack({ devices: [placed] });

    const images: ImageStoreMap = new Map();
    images.set("placement-dev-1", {
      front: {
        dataUrl: "data:image/png;base64,PLACEMENTFRONT",
        filename: "placement-front.png",
      },
    });
    images.set("test-device", {
      front: {
        dataUrl: "data:image/png;base64,SLUGFRONT",
        filename: "slug-front.png",
      },
      rear: {
        dataUrl: "data:image/png;base64,SLUGREAR",
        filename: "slug-rear.png",
      },
    });

    const svg = generateExportSVG(
      [rack],
      [deviceType],
      {
        ...baseOptions,
        exportView: "front",
      },
      images,
    );

    expect(imageHrefs(svg)).toContain("data:image/png;base64,PLACEMENTFRONT");
  });

  it("falls back per face: front-only placement still shows the device-type rear image in a rear export", () => {
    const deviceType = createTestDeviceType({
      slug: "test-device",
      u_height: 2,
      is_full_depth: true,
    });
    const placed = createTestDevice({
      id: "dev-1",
      device_type: "test-device",
      position: 10,
      face: "both",
    });
    const rack = createTestRack({ devices: [placed] });

    const images: ImageStoreMap = new Map();
    images.set("placement-dev-1", {
      front: {
        dataUrl: "data:image/png;base64,PLACEMENTFRONT",
        filename: "placement-front.png",
      },
    });
    images.set("test-device", {
      rear: {
        dataUrl: "data:image/png;base64,SLUGREAR",
        filename: "slug-rear.png",
      },
    });

    const svg = generateExportSVG(
      [rack],
      [deviceType],
      {
        ...baseOptions,
        exportView: "rear",
      },
      images,
    );

    const hrefs = imageHrefs(svg);
    expect(hrefs).toContain("data:image/png;base64,SLUGREAR");
    expect(hrefs).not.toContain("data:image/png;base64,PLACEMENTFRONT");
  });
});
