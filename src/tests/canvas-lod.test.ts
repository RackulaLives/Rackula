/**
 * Canvas level of detail (#3367)
 *
 * Tier selection with hysteresis, the canvas store's tier tracking, and the
 * guarantee that export rendering keeps its labels whatever the canvas zoom.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  nextLodTier,
  LOD_REDUCED_ENTER_BELOW,
  LOD_REDUCED_EXIT_AT,
  type LodTier,
} from "$lib/utils/lod";
import { getCanvasStore, resetCanvasStore } from "$lib/stores/canvas.svelte";
import { generateExportSVG } from "$lib/utils/export";
import type { ExportOptions } from "$lib/types";
import { createMockPanzoom } from "./mocks/panzoom";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

describe("nextLodTier", () => {
  it("stays full at normal zoom levels", () => {
    expect(nextLodTier("full", 1)).toBe("full");
    expect(nextLodTier("full", LOD_REDUCED_EXIT_AT)).toBe("full");
  });

  it("drops to reduced once zoom falls below the enter threshold", () => {
    expect(nextLodTier("full", LOD_REDUCED_ENTER_BELOW)).toBe("full");
    expect(nextLodTier("full", LOD_REDUCED_ENTER_BELOW - 0.01)).toBe("reduced");
    expect(nextLodTier("full", 0.03)).toBe("reduced");
  });

  it("returns to full only at the exit threshold", () => {
    expect(nextLodTier("reduced", LOD_REDUCED_EXIT_AT - 0.01)).toBe("reduced");
    expect(nextLodTier("reduced", LOD_REDUCED_EXIT_AT)).toBe("full");
    expect(nextLodTier("reduced", 2)).toBe("full");
  });

  it("keeps the current tier inside the hysteresis band", () => {
    const inBand = (LOD_REDUCED_ENTER_BELOW + LOD_REDUCED_EXIT_AT) / 2;
    expect(nextLodTier("full", inBand)).toBe("full");
    expect(nextLodTier("reduced", inBand)).toBe("reduced");
  });

  it("does not thrash when zoom jitters around a threshold", () => {
    const jitter = [0.46, 0.44, 0.46, 0.44, 0.47, 0.49, 0.46, 0.49, 0.44];
    let tier: LodTier = "full";
    let changes = 0;
    for (const zoom of jitter) {
      const next = nextLodTier(tier, zoom);
      if (next !== tier) changes++;
      tier = next;
    }
    // One crossing into reduced, never back out while below the exit threshold
    expect(changes).toBe(1);
    expect(tier).toBe("reduced");
  });

  it("gives the same tier on zoom ladder rungs from either direction", () => {
    for (const from of ["full", "reduced"] as const) {
      expect(nextLodTier(from, 0.5)).toBe("full");
      expect(nextLodTier(from, 0.25)).toBe("reduced");
    }
  });
});

describe("canvas store LOD tier", () => {
  beforeEach(() => {
    resetCanvasStore();
  });

  it("starts at full detail", () => {
    expect(getCanvasStore().lodTier).toBe("full");
  });

  it("follows panzoom zoom events with hysteresis", () => {
    const store = getCanvasStore();
    const panzoom = createMockPanzoom(1);
    store.setPanzoomInstance(panzoom);

    panzoom.zoomAbs(0, 0, 0.3);
    expect(store.lodTier).toBe("reduced");

    panzoom.zoomAbs(0, 0, 0.47);
    expect(store.lodTier).toBe("reduced");

    panzoom.zoomAbs(0, 0, 0.75);
    expect(store.lodTier).toBe("full");

    panzoom.zoomAbs(0, 0, 0.47);
    expect(store.lodTier).toBe("full");
  });

  it("picks up the tier of a panzoom instance created zoomed out", () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(0.25));
    expect(store.lodTier).toBe("reduced");
  });
});

describe("export is independent of canvas LOD", () => {
  beforeEach(() => {
    resetCanvasStore();
  });

  it("keeps U labels and device names when the canvas is zoomed out", () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(0.25));
    expect(store.lodTier).toBe("reduced");

    const deviceType = createTestDeviceType({
      slug: "lod-server",
      model: "LOD Server",
      u_height: 2,
    });
    const rack = createTestRack({
      height: 12,
      devices: [
        createTestDevice({
          id: "lod-1",
          device_type: "lod-server",
          name: "Web Node",
          position: 4,
          face: "front",
        }),
      ],
    });
    const options: ExportOptions = {
      format: "svg",
      scope: "all",
      includeNames: true,
      includeLegend: false,
      background: "solid",
      displayMode: "label",
      exportView: "front",
    };

    const svg = generateExportSVG([rack], [deviceType], options);
    const texts = Array.from(svg.getElementsByTagName("text")).map((t) =>
      t.textContent?.trim(),
    );

    expect(texts).toContain("12");
    expect(texts).toContain("1");
    expect(texts).toContain("Web Node");
  });
});
