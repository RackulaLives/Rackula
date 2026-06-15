/**
 * Tests for the floating verb bar positioning math (#2075)
 *
 * Covers the pure computeVerbBarPosition function: above/below placement,
 * rack-name overlap flip, viewport-top flip, low-zoom hide, and horizontal
 * clamping. All inputs are plain numeric rects with no DOM dependency.
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
    rackName: null,
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

describe("computeVerbBarPosition - flip below due to rack name overlap", () => {
  it("flips below when rack name bottom is below the above placement top", () => {
    // target at y=300; bar height=36; aboveTop = 300 - 8 - 36 = 256
    // rackName bottom at 270: 256 < 270, so flip
    const target = makeRect(300, 200, 120, 24);
    const rackName = makeRect(240, 100, 200, 30); // bottom = 270
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, rackName, bar }));
    expect(result.placement).toBe("below");
    expect(result.visible).toBe(true);
  });

  it("sets top to target.bottom + VERB_BAR_MARGIN when flipped below", () => {
    const target = makeRect(300, 200, 120, 24);
    const rackName = makeRect(240, 100, 200, 30); // bottom = 270
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, rackName, bar }));
    expect(result.top).toBe(target.bottom + VERB_BAR_MARGIN);
  });

  it("does not flip when rack name bottom is at or below the above placement top", () => {
    // target at y=300; bar height=36; aboveTop = 256
    // rackName bottom at 256: NOT less than 256, so no flip
    const target = makeRect(300, 200, 120, 24);
    const rackName = makeRect(226, 100, 200, 30); // bottom = 256
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, rackName, bar }));
    expect(result.placement).toBe("above");
  });
});

describe("computeVerbBarPosition - flip below due to viewport top", () => {
  it("flips below when target is near the top of the viewport", () => {
    // target at y=20; bar height=36; aboveTop = 20 - 8 - 36 = -24 < 8 (MARGIN)
    const target = makeRect(20, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    expect(result.placement).toBe("below");
    expect(result.visible).toBe(true);
  });

  it("does not flip when aboveTop exactly equals VERB_BAR_MARGIN", () => {
    // aboveTop = target.top - 8 - 36 = target.top - 44
    // aboveTop === 8 when target.top === 52
    const target = makeRect(52, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    // aboveTop === VERB_BAR_MARGIN (not less than), so stays above
    expect(result.placement).toBe("above");
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
