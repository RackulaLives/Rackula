/**
 * Tests for the roving-tabindex helper used by the floating verb bar (#2075).
 *
 * nextRovingIndex is the pure index math behind ArrowRight/ArrowLeft/Home/End
 * navigation of a horizontal toolbar. The component owns the DOM focus; this
 * helper only computes which index should become active next.
 */
import { describe, it, expect } from "vitest";
import { nextRovingIndex } from "$lib/utils/roving-index";

describe("nextRovingIndex", () => {
  it("ArrowRight advances to the next index", () => {
    expect(nextRovingIndex(0, "ArrowRight", 4)).toBe(1);
    expect(nextRovingIndex(2, "ArrowRight", 4)).toBe(3);
  });

  it("ArrowRight wraps from the last index back to the first", () => {
    expect(nextRovingIndex(3, "ArrowRight", 4)).toBe(0);
  });

  it("ArrowLeft moves to the previous index", () => {
    expect(nextRovingIndex(2, "ArrowLeft", 4)).toBe(1);
    expect(nextRovingIndex(1, "ArrowLeft", 4)).toBe(0);
  });

  it("ArrowLeft wraps from the first index to the last", () => {
    expect(nextRovingIndex(0, "ArrowLeft", 4)).toBe(3);
  });

  it("Home jumps to the first index", () => {
    expect(nextRovingIndex(3, "Home", 4)).toBe(0);
    expect(nextRovingIndex(0, "Home", 4)).toBe(0);
  });

  it("End jumps to the last index", () => {
    expect(nextRovingIndex(0, "End", 4)).toBe(3);
    expect(nextRovingIndex(3, "End", 4)).toBe(3);
  });

  it("returns the current index for unrelated keys", () => {
    expect(nextRovingIndex(2, "Enter", 4)).toBe(2);
    expect(nextRovingIndex(2, " ", 4)).toBe(2);
    expect(nextRovingIndex(2, "Tab", 4)).toBe(2);
    expect(nextRovingIndex(2, "ArrowUp", 4)).toBe(2);
  });

  it("handles a single-item toolbar without moving", () => {
    expect(nextRovingIndex(0, "ArrowRight", 1)).toBe(0);
    expect(nextRovingIndex(0, "ArrowLeft", 1)).toBe(0);
    expect(nextRovingIndex(0, "Home", 1)).toBe(0);
    expect(nextRovingIndex(0, "End", 1)).toBe(0);
  });

  it("clamps a too-large current index into range before moving", () => {
    expect(nextRovingIndex(9, "ArrowRight", 4)).toBe(0);
    expect(nextRovingIndex(9, "ArrowLeft", 4)).toBe(2);
    expect(nextRovingIndex(9, "Home", 4)).toBe(0);
    expect(nextRovingIndex(9, "End", 4)).toBe(3);
  });

  it("returns 0 when the toolbar is empty", () => {
    expect(nextRovingIndex(0, "ArrowRight", 0)).toBe(0);
    expect(nextRovingIndex(3, "ArrowLeft", 0)).toBe(0);
    expect(nextRovingIndex(0, "Home", 0)).toBe(0);
    expect(nextRovingIndex(0, "End", 0)).toBe(0);
  });
});
