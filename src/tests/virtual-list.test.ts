/**
 * Virtual List Windowing Tests
 *
 * Covers the pure windowing math that drives the device palette's virtualized
 * row rendering: which slice of a fixed-height list is visible for a given
 * scroll offset, plus the spacer geometry that keeps the scrollbar honest.
 */

import { describe, it, expect } from "vitest";
import { computeVisibleWindow } from "$lib/utils/virtualList";

describe("computeVisibleWindow", () => {
  const itemHeight = 40;

  it("reports full content height regardless of scroll", () => {
    const w = computeVisibleWindow({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeight,
      itemCount: 100,
      overscan: 0,
    });
    expect(w.totalHeight).toBe(4000);
  });

  it("returns the top slice at scrollTop 0 (no overscan)", () => {
    const w = computeVisibleWindow({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeight,
      itemCount: 100,
      overscan: 0,
    });
    // 200 / 40 = 5 fully-visible rows, +1 for a straddled bottom row -> 0..5,
    // endIndex is exclusive
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(6);
    expect(w.offsetY).toBe(0);
  });

  it("advances the window when scrolled and offsets the spacer", () => {
    const w = computeVisibleWindow({
      scrollTop: 400,
      viewportHeight: 200,
      itemHeight,
      itemCount: 100,
      overscan: 0,
    });
    // 400 / 40 = row 10 at the top, 5 visible + 1 straddled -> [10, 16)
    expect(w.startIndex).toBe(10);
    expect(w.endIndex).toBe(16);
    expect(w.offsetY).toBe(400);
  });

  it("expands the window by the overscan on both sides", () => {
    const w = computeVisibleWindow({
      scrollTop: 400,
      viewportHeight: 200,
      itemHeight,
      itemCount: 100,
      overscan: 3,
    });
    expect(w.startIndex).toBe(7); // 10 - 3
    expect(w.endIndex).toBe(19); // 16 + 3
    expect(w.offsetY).toBe(7 * itemHeight);
  });

  it("clamps the start index at zero when overscanning past the top", () => {
    const w = computeVisibleWindow({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeight,
      itemCount: 100,
      overscan: 5,
    });
    expect(w.startIndex).toBe(0);
    expect(w.offsetY).toBe(0);
  });

  it("clamps the end index at the item count near the bottom", () => {
    const w = computeVisibleWindow({
      scrollTop: 3900, // near the very bottom of a 100-item, 4000px list
      viewportHeight: 200,
      itemHeight,
      itemCount: 100,
      overscan: 2,
    });
    expect(w.endIndex).toBe(100);
    expect(w.endIndex).toBeLessThanOrEqual(100);
  });

  it("renders the whole list when it fits in the viewport", () => {
    const w = computeVisibleWindow({
      scrollTop: 0,
      viewportHeight: 1000,
      itemHeight,
      itemCount: 5,
      overscan: 0,
    });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(5);
    expect(w.totalHeight).toBe(200);
  });

  it("returns an empty window for an empty list", () => {
    const w = computeVisibleWindow({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeight,
      itemCount: 0,
      overscan: 2,
    });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(0);
    expect(w.totalHeight).toBe(0);
    expect(w.offsetY).toBe(0);
  });

  it("renders a valid bottom slice when scrollTop is stale after the list shrinks", () => {
    // A long list was scrolled near the bottom (scrollTop for ~1000 rows),
    // then a filter shrank it to 10 rows without a new scroll event firing.
    const w = computeVisibleWindow({
      scrollTop: 39600,
      viewportHeight: 200,
      itemHeight,
      itemCount: 10,
      overscan: 4,
    });
    // The window must stay within bounds and render the items that exist,
    // not collapse to an empty slice translated past the content.
    expect(w.startIndex).toBeLessThanOrEqual(w.endIndex);
    expect(w.endIndex).toBe(10);
    expect(w.endIndex - w.startIndex).toBeGreaterThan(0);
    expect(w.offsetY).toBeLessThanOrEqual(w.totalHeight);
  });

  it("treats a non-positive itemHeight as a single rendered batch", () => {
    const w = computeVisibleWindow({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeight: 0,
      itemCount: 10,
      overscan: 0,
    });
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(10);
  });
});
