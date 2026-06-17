/**
 * Tests for the floating verb bar positioning math (#2075, #2388)
 *
 * Covers the pure computeVerbBarPosition function: above/below placement flip,
 * low-zoom hide, and horizontal clamping. All inputs are plain numeric rects
 * with no DOM dependency.
 */
import { describe, it, expect } from "vitest";
import {
  computeVerbBarPosition,
  VERB_BAR_LOW_ZOOM_THRESHOLD,
  VERB_BAR_MARGIN,
  VERB_BAR_FLIP_THRESHOLD,
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

describe("computeVerbBarPosition - placement flip", () => {
  it("places above when there is ample room above the target", () => {
    // target.top = 300, bar height = 36, margin = 8 -> need 44px above.
    // aboveTop = 300 - 8 - 36 = 256, well above VERB_BAR_FLIP_THRESHOLD.
    const target = makeRect(300, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    expect(result.placement).toBe("above");
  });

  it("flips below when target is near the top and there is insufficient room above", () => {
    // Place the target so aboveTop would be < VERB_BAR_FLIP_THRESHOLD.
    // If VERB_BAR_FLIP_THRESHOLD = 80, target.top must be < 80 + bar.height + margin.
    // bar.height=36, margin=8 -> target.top < 124. Use target.top=20.
    const target = makeRect(20, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    expect(result.placement).toBe("below");
    expect(result.visible).toBe(true);
  });

  it("sets top to just below target bottom when flipping below", () => {
    const target = makeRect(20, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    const expectedTop = target.bottom + VERB_BAR_MARGIN;
    expect(result.top).toBe(expectedTop);
  });

  it("sets top to just above target top when placing above", () => {
    const target = makeRect(300, 200, 120, 24);
    const bar: Size = { width: 180, height: 36 };
    const result = computeVerbBarPosition(input({ target, bar }));
    const expectedTop = target.top - VERB_BAR_MARGIN - bar.height;
    expect(result.top).toBe(expectedTop);
  });

  it("places above exactly at the flip threshold boundary", () => {
    // target.top exactly at the minimum to remain above: flip when aboveTop < VERB_BAR_FLIP_THRESHOLD.
    // aboveTop = target.top - margin - bar.height = target.top - 44.
    // To be exactly at threshold: target.top - 44 = VERB_BAR_FLIP_THRESHOLD -> target.top = threshold + 44.
    const bar: Size = { width: 180, height: 36 };
    const targetTop = VERB_BAR_FLIP_THRESHOLD + VERB_BAR_MARGIN + bar.height;
    const target = makeRect(targetTop, 200, 120, 24);
    const result = computeVerbBarPosition(input({ target, bar }));
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

describe("computeVerbBarPosition - flip-below viewport clamping", () => {
  it("clamps the flipped position so a tall target keeps the bar on-screen", () => {
    // A rack container is tall: its top is near the viewport top (forcing a
    // flip below) but its bottom is far below the fold. Without clamping, the
    // bar would render at target.bottom, off-screen and unreachable.
    const bar: Size = { width: 180, height: 36 };
    const viewport: Size = { width: 1280, height: 800 };
    const target = makeRect(10, 200, 480, 2000); // bottom = 2010, below the fold
    const result = computeVerbBarPosition(input({ target, bar, viewport }));
    expect(result.placement).toBe("below");
    expect(result.visible).toBe(true);
    const maxTop = viewport.height - bar.height - VERB_BAR_MARGIN;
    expect(result.top).toBeLessThanOrEqual(maxTop);
    expect(result.top + bar.height).toBeLessThanOrEqual(viewport.height);
  });

  it("leaves a short target's flipped position unclamped", () => {
    // A device row near the top flips below; its bottom is on-screen, so the
    // position stays at target.bottom + margin, not pinned to the fold.
    const bar: Size = { width: 180, height: 36 };
    const viewport: Size = { width: 1280, height: 800 };
    const target = makeRect(20, 200, 120, 24); // bottom = 44, on-screen
    const result = computeVerbBarPosition(input({ target, bar, viewport }));
    expect(result.top).toBe(target.bottom + VERB_BAR_MARGIN);
  });
});
