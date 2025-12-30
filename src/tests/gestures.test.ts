/**
 * Touch Gesture Utility Tests
 * Tests for long-press gesture detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLongPress } from "$lib/utils/gestures";

describe("useLongPress", () => {
  let element: HTMLElement;
  let callback: ReturnType<typeof vi.fn>;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    element = document.createElement("div");
    callback = vi.fn();
    cleanup = undefined;

    // Mock navigator.vibrate
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("basic functionality", () => {
    it("calls callback after 500ms of press", () => {
      cleanup = useLongPress(element, callback);

      // Simulate pointerdown with primary pointer
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );

      // Fast-forward 499ms - should not trigger
      vi.advanceTimersByTime(499);
      expect(callback).not.toHaveBeenCalled();

      // Fast-forward 1ms more (total 500ms) - should trigger
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("accepts custom duration via number (legacy API)", () => {
      cleanup = useLongPress(element, callback, 300);

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );

      vi.advanceTimersByTime(299);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("accepts custom duration via options object", () => {
      cleanup = useLongPress(element, callback, { duration: 300 });

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );

      vi.advanceTimersByTime(299);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancellation", () => {
    it("cancels on pointerup before duration", () => {
      cleanup = useLongPress(element, callback);

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(200);

      // Release before 500ms
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      vi.advanceTimersByTime(300);

      expect(callback).not.toHaveBeenCalled();
    });

    it("cancels on pointercancel", () => {
      cleanup = useLongPress(element, callback);

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(200);

      element.dispatchEvent(
        new PointerEvent("pointercancel", { bubbles: true }),
      );
      vi.advanceTimersByTime(300);

      expect(callback).not.toHaveBeenCalled();
    });

    it("cancels on pointermove beyond threshold", () => {
      cleanup = useLongPress(element, callback);

      // Start press at 0,0
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          clientX: 0,
          clientY: 0,
        }),
      );

      vi.advanceTimersByTime(200);

      // Move 11px (threshold is 10px)
      element.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 11,
          clientY: 0,
        }),
      );

      vi.advanceTimersByTime(300);
      expect(callback).not.toHaveBeenCalled();
    });

    it("does not cancel on small movement within threshold", () => {
      cleanup = useLongPress(element, callback);

      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          clientX: 0,
          clientY: 0,
        }),
      );

      vi.advanceTimersByTime(200);

      // Move 5px (within 10px threshold)
      element.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 5,
          clientY: 0,
        }),
      );

      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("multi-touch handling", () => {
    it("ignores non-primary pointer events", () => {
      cleanup = useLongPress(element, callback);

      // Non-primary pointer (e.g., second finger)
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: false }),
      );

      vi.advanceTimersByTime(500);
      expect(callback).not.toHaveBeenCalled();
    });

    it("only responds to primary pointer", () => {
      cleanup = useLongPress(element, callback);

      // Primary pointer
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );

      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("haptic feedback", () => {
    it("triggers haptic feedback if available", () => {
      cleanup = useLongPress(element, callback);

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(500);

      expect(navigator.vibrate).toHaveBeenCalledWith(50);
    });

    it("handles missing vibrate API gracefully", () => {
      // Remove vibrate API
      Object.defineProperty(navigator, "vibrate", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      cleanup = useLongPress(element, callback);

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(500);

      // Should still call callback
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("options callbacks", () => {
    it("calls onStart when pointer goes down", () => {
      const onStart = vi.fn();
      cleanup = useLongPress(element, callback, { onStart });

      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          isPrimary: true,
          clientX: 100,
          clientY: 200,
        }),
      );

      expect(onStart).toHaveBeenCalledWith(100, 200);
    });

    it("calls onCancel when gesture is cancelled", () => {
      const onCancel = vi.fn();
      cleanup = useLongPress(element, callback, { onCancel });

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(200);

      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

      expect(onCancel).toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it("calls onProgress during hold", () => {
      const onProgress = vi.fn();
      cleanup = useLongPress(element, callback, { onProgress });

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );

      // Initial progress call
      expect(onProgress).toHaveBeenCalledWith(0);

      // Advance some time to trigger animation frames
      vi.advanceTimersByTime(500);

      // Final progress should be 1
      expect(onProgress).toHaveBeenLastCalledWith(1);
    });

    it("delivers final progress value before callback", () => {
      const callOrder: string[] = [];
      const onProgress = vi.fn(() => callOrder.push("progress"));
      const trackedCallback = vi.fn(() => callOrder.push("callback"));

      cleanup = useLongPress(element, trackedCallback, { onProgress });

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(500);

      // Progress(1) should be called before callback
      const lastProgressIndex = callOrder.lastIndexOf("progress");
      const callbackIndex = callOrder.indexOf("callback");
      expect(lastProgressIndex).toBeLessThan(callbackIndex);
    });
  });

  describe("cleanup", () => {
    it("cleans up event listeners on cleanup", () => {
      const removeEventListenerSpy = vi.spyOn(element, "removeEventListener");

      cleanup = useLongPress(element, callback);
      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerdown",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerup",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointercancel",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointermove",
        expect.any(Function),
      );
    });

    it("clears pending timers on cleanup", () => {
      cleanup = useLongPress(element, callback);

      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, isPrimary: true }),
      );
      vi.advanceTimersByTime(200);

      // Cleanup before timer fires
      cleanup();
      cleanup = undefined;

      vi.advanceTimersByTime(300);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
