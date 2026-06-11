/**
 * Tests for canvas coordinate math helpers (#1610)
 *
 * Covers the pure pan/zoom and swipe-navigation math extracted from
 * Canvas.svelte: shift-scroll horizontal pan, swipe rack switching with
 * wraparound, the horizontal pan-lock threshold, and pan-gating target
 * classification. Zoom clamping and fit-all math are covered separately
 * in canvas-store.test.ts and canvas-utils.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  shiftScrollPan,
  resolveSwipeTargetRackId,
  exceedsHorizontalPanLock,
  panBlockReason,
  isRackInteractionTarget,
  type CanvasPointerTarget,
} from "$lib/utils/canvas-coordinates";

function stubTarget(
  overrides: Partial<CanvasPointerTarget> = {},
): CanvasPointerTarget {
  return {
    draggable: false,
    getAttribute: () => null,
    closest: () => null,
    ...overrides,
  };
}

describe("shiftScrollPan", () => {
  it("pans left when scrolling down (positive deltaY)", () => {
    expect(shiftScrollPan({ x: 100, y: 50 }, 40)).toEqual({ x: 60, y: 50 });
  });

  it("pans right when scrolling up (negative deltaY)", () => {
    expect(shiftScrollPan({ x: 100, y: 50 }, -40)).toEqual({ x: 140, y: 50 });
  });

  it("keeps the vertical pan position unchanged", () => {
    expect(shiftScrollPan({ x: 0, y: -321 }, 15).y).toBe(-321);
  });

  it("works from negative pan offsets", () => {
    expect(shiftScrollPan({ x: -500, y: -200 }, 25)).toEqual({
      x: -525,
      y: -200,
    });
  });

  it("preserves fractional trackpad deltas without rounding", () => {
    const next = shiftScrollPan({ x: 100, y: 0 }, 0.6);
    expect(next.x).toBeCloseTo(99.4, 10);
  });

  it("returns the same position for zero delta", () => {
    expect(shiftScrollPan({ x: 12, y: 34 }, 0)).toEqual({ x: 12, y: 34 });
  });
});

describe("resolveSwipeTargetRackId", () => {
  const ids = ["rack-a", "rack-b", "rack-c"];

  it("moves to the next rack from the middle", () => {
    expect(resolveSwipeTargetRackId(ids, "rack-b", "next")).toBe("rack-c");
  });

  it("moves to the previous rack from the middle", () => {
    expect(resolveSwipeTargetRackId(ids, "rack-b", "previous")).toBe("rack-a");
  });

  it("wraps from the last rack to the first on next", () => {
    expect(resolveSwipeTargetRackId(ids, "rack-c", "next")).toBe("rack-a");
  });

  it("wraps from the first rack to the last on previous", () => {
    expect(resolveSwipeTargetRackId(ids, "rack-a", "previous")).toBe("rack-c");
  });

  it("starts at the first rack when none is active and swiping next", () => {
    expect(resolveSwipeTargetRackId(ids, null, "next")).toBe("rack-a");
  });

  it("starts at the last rack when none is active and swiping previous", () => {
    expect(resolveSwipeTargetRackId(ids, null, "previous")).toBe("rack-c");
  });

  it("treats an unknown active rack id like no active rack", () => {
    expect(resolveSwipeTargetRackId(ids, "rack-zz", "next")).toBe("rack-a");
  });

  it("returns null with fewer than two racks", () => {
    expect(resolveSwipeTargetRackId(["rack-a"], "rack-a", "next")).toBeNull();
    expect(resolveSwipeTargetRackId(["rack-a"], null, "next")).toBeNull();
    expect(resolveSwipeTargetRackId([], null, "next")).toBeNull();
  });
});

describe("exceedsHorizontalPanLock", () => {
  it("is false below the threshold", () => {
    expect(exceedsHorizontalPanLock(100, 119)).toBe(false);
  });

  it("is false exactly at the threshold (strictly greater)", () => {
    expect(exceedsHorizontalPanLock(100, 120)).toBe(false);
  });

  it("is true above the threshold", () => {
    expect(exceedsHorizontalPanLock(100, 121)).toBe(true);
  });

  it("is direction-agnostic for leftward movement", () => {
    expect(exceedsHorizontalPanLock(100, 60)).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(exceedsHorizontalPanLock(0, 15, 10)).toBe(true);
    expect(exceedsHorizontalPanLock(0, 5, 10)).toBe(false);
  });
});

describe("panBlockReason", () => {
  it("blocks pan for elements with the draggable property", () => {
    expect(panBlockReason(stubTarget({ draggable: true }))).toBe("draggable");
  });

  it("blocks pan for elements with a draggable attribute", () => {
    expect(
      panBlockReason(
        stubTarget({
          getAttribute: (name) => (name === "draggable" ? "true" : null),
        }),
      ),
    ).toBe("draggable");
  });

  it("blocks pan when a draggable ancestor matches", () => {
    expect(
      panBlockReason(
        stubTarget({
          closest: (selector) =>
            selector === '[draggable="true"]' ? {} : null,
        }),
      ),
    ).toBe("draggable");
  });

  it("blocks pan inside a rack area", () => {
    expect(
      panBlockReason(
        stubTarget({
          closest: (selector) =>
            selector.includes(".rack-dual-view") ? {} : null,
        }),
      ),
    ).toBe("rack-area");
  });

  it("blocks pan inside a bayed rack area", () => {
    expect(
      panBlockReason(
        stubTarget({
          closest: (selector) =>
            selector.includes(".bayed-rack-view") ? {} : null,
        }),
      ),
    ).toBe("rack-area");
  });

  it("allows pan when the target does not support closest", () => {
    expect(panBlockReason(stubTarget({ closest: undefined }))).toBeNull();
  });

  it("prioritises draggable over rack area", () => {
    expect(
      panBlockReason(stubTarget({ draggable: true, closest: () => ({}) })),
    ).toBe("draggable");
  });

  it("allows pan on the canvas background", () => {
    expect(panBlockReason(stubTarget())).toBeNull();
  });

  it("allows pan for a missing target", () => {
    expect(panBlockReason(null)).toBeNull();
  });
});

describe("isRackInteractionTarget", () => {
  it("is false for a missing target", () => {
    expect(isRackInteractionTarget(null)).toBe(false);
  });

  it("is true when an ancestor matches a rack selector", () => {
    expect(
      isRackInteractionTarget(
        stubTarget({
          closest: (selector) =>
            selector.includes(".rack-wrapper") ? {} : null,
        }),
      ),
    ).toBe(true);
  });

  it("is false outside any rack element", () => {
    expect(isRackInteractionTarget(stubTarget())).toBe(false);
  });
});
