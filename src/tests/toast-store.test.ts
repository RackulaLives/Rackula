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
      expect(toastStore.toasts.length).toBe(MAX_VISIBLE_TOASTS);
    });

    it("drops the oldest toasts first, keeping the most recent", () => {
      const toastStore = getToastStore();
      for (let i = 0; i < MAX_VISIBLE_TOASTS + 2; i++) {
        toastStore.showToast(`Undid: action ${i}`, "info");
      }
      const messages = toastStore.toasts.map((t) => t.message);
      // The two oldest ("action 0" and "action 1") were evicted; the newest
      // MAX_VISIBLE_TOASTS remain, in order.
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
});
