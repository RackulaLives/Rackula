/**
 * Toast store tests (#3004)
 *
 * Covers the visible-stack cap that keeps rapid consecutive toasts (e.g.
 * undo/redo, R27b) from piling an unbounded column over the canvas, and the
 * basic dismiss/clear behavior other stores rely on.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getToastStore,
  resetToastStore,
  MAX_VISIBLE_TOASTS,
} from "$lib/stores/toast.svelte";

describe("toast store", () => {
  beforeEach(() => {
    resetToastStore();
  });

  it("shows a toast", () => {
    const toastStore = getToastStore();
    toastStore.showToast("Hello", "info");
    expect(toastStore.toasts.length).toBe(1);
    expect(toastStore.toasts[0]?.message).toBe("Hello");
  });

  it("dismisses a specific toast by id", () => {
    const toastStore = getToastStore();
    const id = toastStore.showToast("Hello", "info");
    toastStore.dismissToast(id);
    expect(toastStore.toasts.length).toBe(0);
  });

  it("clears every toast", () => {
    const toastStore = getToastStore();
    toastStore.showToast("One", "info");
    toastStore.showToast("Two", "info");
    toastStore.clearAllToasts();
    expect(toastStore.toasts.length).toBe(0);
  });

  describe("visible stack cap (#3004/R27b)", () => {
    it("caps the visible stack at MAX_VISIBLE_TOASTS", () => {
      const toastStore = getToastStore();
      for (let i = 0; i < MAX_VISIBLE_TOASTS + 2; i++) {
        toastStore.showToast(`Undid: action ${i}`, "info");
      }
      // Pagination invariant: MAX_VISIBLE_TOASTS is the visible-stack cap, so
      // the count must land at exactly that value once it is exceeded (no
      // eslint-disable needed: the lint rule only flags toHaveLength() with a
      // literal argument, and this asserts against the named constant).
      expect(toastStore.toasts.length).toBe(MAX_VISIBLE_TOASTS);
    });

    it("drops the oldest toasts first, keeping the most recent", () => {
      const toastStore = getToastStore();
      for (let i = 0; i < MAX_VISIBLE_TOASTS + 2; i++) {
        toastStore.showToast(`Undid: action ${i}`, "info");
      }
      const messages = toastStore.toasts.map((t) => t.message);
      // Pagination invariant: the two oldest ("action 0" and "action 1") were
      // evicted; the newest MAX_VISIBLE_TOASTS remain, in order (no
      // eslint-disable needed: the lint rule only flags toHaveLength() with a
      // literal argument, not toEqual() array comparisons).
      expect(messages).toEqual([
        "Undid: action 2",
        "Undid: action 3",
        "Undid: action 4",
      ]);
    });

    it("simulates five rapid undo toasts resulting in a capped count, not five entries", () => {
      const toastStore = getToastStore();
      for (let i = 0; i < 5; i++) {
        toastStore.showToast(`Undid: step ${i}`, "info");
      }
      expect(toastStore.toasts.length).toBeLessThan(5);
      expect(toastStore.toasts.length).toBeLessThanOrEqual(MAX_VISIBLE_TOASTS);
    });

    it("does not cap a stack at or below the limit", () => {
      const toastStore = getToastStore();
      toastStore.showToast("One", "info");
      toastStore.showToast("Two", "info");
      expect(toastStore.toasts.length).toBe(2);
    });
  });

  // CodeAnt review on PR #3031 (Major): the stack cap was a blind FIFO that
  // could evict a still-valid Undo affordance for a destructive action (e.g.
  // device removal) during a toast burst, hiding recoverability before the
  // user could click it. The cap must skip undo-affordance toasts and evict
  // the oldest non-undo toast instead; only when every visible toast is an
  // undo affordance is one of those evicted (safe: they still auto-dismiss
  // at 5s or via dismissUndoToasts()).
  describe("undo-affordance protection from stack-cap eviction (#3004)", () => {
    it("evicts the oldest non-undo toast first, leaving an undo toast intact and clickable", () => {
      const toastStore = getToastStore();
      let undone = false;
      toastStore.showUndoToast("Removed A", () => {
        undone = true;
      });
      toastStore.showToast("Info one", "info");
      toastStore.showToast("Info two", "info");
      // Cap is 3; this exceeds it and must evict "Info one" (oldest non-undo
      // toast), never the undo toast.
      toastStore.showToast("Info three", "info");

      const messages = toastStore.toasts.map((t) => t.message);
      expect(messages).toEqual(["Removed A", "Info two", "Info three"]);

      const undoToast = toastStore.toasts.find((t) => t.isUndoAffordance);
      expect(undoToast).toBeDefined();
      undoToast?.action?.onClick();
      expect(undone).toBe(true);
    });

    it("keeps evicting non-undo toasts as more arrive, never touching the undo toast", () => {
      const toastStore = getToastStore();
      toastStore.showUndoToast("Removed A", () => {});
      for (let i = 0; i < 5; i++) {
        toastStore.showToast(`Info ${i}`, "info");
      }
      expect(toastStore.toasts.some((t) => t.isUndoAffordance)).toBe(true);
      expect(toastStore.toasts.length).toBe(MAX_VISIBLE_TOASTS);
    });

    it("falls back to evicting the oldest toast when every visible toast is an undo affordance", () => {
      const toastStore = getToastStore();
      for (let i = 0; i < MAX_VISIBLE_TOASTS + 1; i++) {
        toastStore.showUndoToast(`Undo ${i}`, () => {});
      }
      const messages = toastStore.toasts.map((t) => t.message);
      expect(messages).toEqual(["Undo 1", "Undo 2", "Undo 3"]);
      expect(toastStore.toasts.length).toBe(MAX_VISIBLE_TOASTS);
    });
  });
});
