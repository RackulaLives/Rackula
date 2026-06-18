import { describe, it, expect } from "vitest";
import {
  createTouchDragThreshold,
  DRAG_THRESHOLD_PX,
} from "$lib/utils/panzoom-lifecycle";

describe("createTouchDragThreshold", () => {
  it("blocks sub-threshold movement so a tap is not misread as a micro-drag", () => {
    const gate = createTouchDragThreshold();
    gate.onStart(100, 200);
    // 3px movement is below the 8px threshold
    expect(gate.shouldBlock(103, 200)).toBe(true);
    expect(gate.shouldBlock(100, 204)).toBe(true);
  });

  it("allows movement once the threshold is exceeded", () => {
    const gate = createTouchDragThreshold();
    gate.onStart(100, 200);
    // Exactly at threshold: not blocked (>= comparison)
    expect(gate.shouldBlock(100 + DRAG_THRESHOLD_PX, 200)).toBe(false);
  });

  it("once threshold is exceeded, allows all subsequent moves without re-blocking", () => {
    const gate = createTouchDragThreshold();
    gate.onStart(100, 200);
    // Cross the threshold
    expect(gate.shouldBlock(100 + 10, 200)).toBe(false);
    // A subsequent small move (which would normally be sub-threshold relative
    // to the start) must also pass through, because the gesture is now a drag.
    expect(gate.shouldBlock(100 + 11, 200)).toBe(false);
    expect(gate.shouldBlock(100 + 11, 200)).toBe(false);
  });

  it("resets on the next onStart so a new gesture starts in tap mode", () => {
    const gate = createTouchDragThreshold();
    gate.onStart(100, 200);
    expect(gate.shouldBlock(100 + 10, 200)).toBe(false);
    // New touch gesture
    gate.onStart(50, 50);
    // Sub-threshold relative to the new start
    expect(gate.shouldBlock(52, 50)).toBe(true);
  });

  it("respects a custom threshold", () => {
    const gate = createTouchDragThreshold(20);
    gate.onStart(0, 0);
    expect(gate.shouldBlock(15, 0)).toBe(true);
    expect(gate.shouldBlock(20, 0)).toBe(false);
  });

  it("uses Euclidean distance, not per-axis", () => {
    const gate = createTouchDragThreshold(10);
    gate.onStart(0, 0);
    // 6px on each axis: 6+6=12 per-axis, but hypot(6,6)=8.49 < 10
    expect(gate.shouldBlock(6, 6)).toBe(true);
    // 8px on each axis: hypot(8,8)=11.31 >= 10
    expect(gate.shouldBlock(8, 8)).toBe(false);
  });

  it("reset() clears the exceeded flag so shouldBlock re-evaluates from start", () => {
    const gate = createTouchDragThreshold();
    gate.onStart(0, 0);
    // Exceed the threshold so hasExceeded is set.
    expect(gate.shouldBlock(10, 0)).toBe(false);
    gate.reset();
    // Without reset the flag would still be set and this would return false.
    // 5px is below the 8px threshold, so a cleared flag means it blocks.
    expect(gate.shouldBlock(5, 0)).toBe(true);
  });
});
