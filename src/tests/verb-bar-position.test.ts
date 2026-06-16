/**
 * Tests for the floating verb bar positioning math (#2075)
 *
 * Covers the pure computeVerbBarPosition function: always-above placement,
 * low-zoom hide, and horizontal clamping. All inputs are plain numeric rects
 * with no DOM dependency.
 */
import { describe, it, expect } from "vitest";
import {
  computeVerbBarPosition,
  VERB_BAR_LOW_ZOOM_THRESHOLD,
  VERB_BAR_MARGIN,
  type Rect,
  type Size,
  type VerbBarPositionInput,
} from "$lib/utils/verb-bar-position";

function makeRect(
  top: number,
  left: number,
  width: number,
  height: number,
): Rect {
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
  };
}

function input(overrides: Partial<VerbBarPositionInput>): VerbBarPositionInput {
  return {
    target: makeRect(300, 200, 120, 24),
    bar: { width: 180, height: 36 },
    viewport: { width: 1280, height: 800 },
    scale: 1,
    ...overrides,
  };
}

describe("computeVerbBarPosition - above placement", () => {
  it("places above and is visible when there is ample room", () => {
    const result = computeVerbBarPosition(input({}));
    expect(result.visible).toBe(true);
    expect(result.placement).toBe("above");
  });

  it("centres the bar horizontally over the target", () => {
    const target = makeRect(300, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    const expectedLeft = target.left + target.width / 2 - bar.width / 2;
    expect(result.left).toBe(expectedLeft);
  });

  it("sets top to aboveTop when placing above", () => {
    const target = makeRect(300, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    const expectedTop = target.top - VERB_BAR_MARGIN - bar.height;
    expect(result.top).toBe(expectedTop);
  });
});

describe("computeVerbBarPosition - always above near viewport top", () => {
  it("stays above for the topmost target near the top of the viewport", () => {
    // target at y=20; bar height=36; aboveTop = 20 - 8 - 36 = -24.
    // The bar may sit partly off-screen or overlap the rack name label,
    // but it never flips below the target.
    const target = makeRect(20, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    expect(result.placement).toBe("above");
    expect(result.visible).toBe(true);
  });

  it("keeps top at aboveTop for the topmost target", () => {
    const target = makeRect(20, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    expect(result.top).toBe(target.top - VERB_BAR_MARGIN - bar.height);
  });
});

describe("computeVerbBarPosition - low zoom hide", () => {
  it("is hidden when scale is just below the threshold", () => {
    const result = computeVerbBarPosition(
      input({ scale: VERB_BAR_LOW_ZOOM_THRESHOLD - 0.01 }),
    );
    expect(result.visible).toBe(false);
  });

  it("is visible at exactly the threshold", () => {
    const result = computeVerbBarPosition(
      input({ scale: VERB_BAR_LOW_ZOOM_THRESHOLD }),
    );
    expect(result.visible).toBe(true);
  });

  it("is visible above the threshold", () => {
    const result = computeVerbBarPosition(
      input({ scale: VERB_BAR_LOW_ZOOM_THRESHOLD + 0.1 }),
    );
    expect(result.visible).toBe(true);
  });

  it("returns zero coordinates when hidden", () => {
    const result = computeVerbBarPosition(
      input({ scale: VERB_BAR_LOW_ZOOM_THRESHOLD - 0.01 }),
    );
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
    expect(result.placement).toBe("above");
  });
});

describe("computeVerbBarPosition - horizontal clamping", () => {
  it("clamps left when target is near the right edge", () => {
    // target right-aligned: left=1200, width=120 -> centre at 1260
    // bar width=180: unclamped left = 1260 - 90 = 1170
    // max left = 1280 - 180 - 8 = 1092
    const target = makeRect(300, 1200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const viewport: Size = { width: 1280, height: 800 };
    const result = computeVerbBarPosition(input({ target, bar, viewport }));
    expect(result.left).toBeLessThanOrEqual(
      viewport.width - bar.width - VERB_BAR_MARGIN,
    );
  });

  it("clamps left when target is near the left edge", () => {
    // target at left=0, width=120 -> centre at 60
    // bar width=180: unclamped left = 60 - 90 = -30
    // min left = VERB_BAR_MARGIN = 8
    const target = makeRect(300, 0, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const viewport: Size = { width: 1280, height: 800 };
    const result = computeVerbBarPosition(input({ target, bar, viewport }));
    expect(result.left).toBeGreaterThanOrEqual(VERB_BAR_MARGIN);
  });

  it("does not clamp when target is centred in the viewport", () => {
    // target centred: left=550, width=180 -> centre at 640
    // bar width=180: unclamped left = 640 - 90 = 550 (well inside viewport)
    const target = makeRect(300, 550, 180, 24);
    const bar: Size = { width: 180, height: 36 };
    const viewport: Size = { width: 1280, height: 800 };
    const result = computeVerbBarPosition(input({ target, bar, viewport }));
    const expectedLeft = target.left + target.width / 2 - bar.width / 2;
    expect(result.left).toBe(expectedLeft);
  });
});
