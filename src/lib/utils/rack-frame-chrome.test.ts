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

/** Collect every numeric coordinate a shape carries, for finiteness checks. */
function coordsOf(shape: { kind: string } & Record<string, unknown>): number[] {
  return Object.values(shape).filter((v): v is number => typeof v === "number");
}

describe("frameChromeFor", () => {
  it("returns chrome for every form factor with a matching variant", () => {
    for (const formFactor of FormFactorSchema.options) {
      const chrome = frameChromeFor(formFactor, METRICS);
      expect(chrome.variant).toBe(formFactor);
      expect(chrome.shapes.length).toBeGreaterThan(0);
    }
  });

  it("draws an enclosing top bar for enclosed form factors and a thin tie for open ones", () => {
    const enclosed = ["4-post-cabinet", "4-post", "wall-mount"] as const;
    const open = ["2-post", "open-frame"] as const;

    for (const formFactor of enclosed) {
      expect(frameChromeFor(formFactor, METRICS).topBar.height).toBe(
        METRICS.railWidth,
      );
    }
    for (const formFactor of open) {
      expect(frameChromeFor(formFactor, METRICS).topBar.height).toBeLessThan(
        METRICS.railWidth,
      );
    }
  });

  it("produces finite geometry for every shape", () => {
    for (const formFactor of FormFactorSchema.options) {
      const chrome = frameChromeFor(formFactor, METRICS);
      const bars = [chrome.topBar, chrome.bottomBar];
      for (const bar of bars) {
        expect(Number.isFinite(bar.y)).toBe(true);
        expect(Number.isFinite(bar.height)).toBe(true);
      }
      for (const shape of chrome.shapes) {
        for (const coord of coordsOf(shape)) {
          expect(Number.isFinite(coord)).toBe(true);
        }
      }
    }
  });

  it("gives each form factor a visually distinct chrome", () => {
    const signatures = FormFactorSchema.options.map((formFactor) => {
      const chrome = frameChromeFor(formFactor, METRICS);
      return [chrome.topBar.height, ...chrome.shapes.map((s) => s.cls)].join(
        "|",
      );
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
