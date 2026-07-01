import { describe, it, expect } from "vitest";
import { FormFactorSchema } from "$lib/schemas";
import { frameChromeFor, type FrameMetrics } from "./rack-frame-chrome";

// A representative 12U rack in the same SVG user space RackFrame.svelte uses.
const METRICS: FrameMetrics = {
  rackWidth: 482.6,
  railWidth: 30,
  totalHeight: 12 * 17.78,
  rackPadding: 16,
};

describe("frameChromeFor", () => {
  // The per-form-factor decorative chrome (#2735 / PR #2752) is disabled
  // (issue #2805): every form factor must return the generic frame.
  it("returns the generic frame with no decorative shapes for every form factor", () => {
    for (const formFactor of FormFactorSchema.options) {
      const chrome = frameChromeFor(formFactor, METRICS);

      expect(chrome.variant).toBe(formFactor);
      expect(chrome.shapes).toEqual([]);

      // Solid top bar at the top zone, full rail width.
      expect(chrome.topBar.y).toBe(METRICS.rackPadding);
      expect(chrome.topBar.height).toBe(METRICS.railWidth);

      // Solid bottom bar below the U grid, full rail width.
      const gridBottom =
        METRICS.rackPadding + METRICS.railWidth + METRICS.totalHeight;
      expect(chrome.bottomBar.y).toBe(gridBottom);
      expect(chrome.bottomBar.height).toBe(METRICS.railWidth);
    }
  });

  it("produces the identical frame for every form factor", () => {
    const [first, ...rest] = FormFactorSchema.options.map((formFactor) => {
      const chrome = frameChromeFor(formFactor, METRICS);
      // Compare bars and shapes; variant is intentionally per-form-factor.
      return JSON.stringify({
        topBar: chrome.topBar,
        bottomBar: chrome.bottomBar,
        shapes: chrome.shapes,
      });
    });
    for (const signature of rest) {
      expect(signature).toBe(first);
    }
  });
});
