/**
 * Motion Utility Tests
 * Tests for reduced motion accessibility utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prefersReducedMotion, getAnimationDuration } from "$lib/utils/motion";

describe("Motion Utilities", () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Default: no reduced motion preference
    matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  describe("prefersReducedMotion", () => {
    it("returns false when reduced motion is not preferred", () => {
      expect(prefersReducedMotion()).toBe(false);
    });

    it("returns true when reduced motion is preferred", () => {
      matchMediaSpy.mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(prefersReducedMotion()).toBe(true);
    });

    it("queries the correct media query", () => {
      prefersReducedMotion();
      expect(matchMediaSpy).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)",
      );
    });
  });

  describe("getAnimationDuration", () => {
    it("returns normal duration when reduced motion is not preferred", () => {
      expect(getAnimationDuration(300)).toBe(300);
      expect(getAnimationDuration(1000)).toBe(1000);
      expect(getAnimationDuration(0)).toBe(0);
    });

    it("returns 0 when reduced motion is preferred", () => {
      matchMediaSpy.mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(getAnimationDuration(300)).toBe(0);
      expect(getAnimationDuration(1000)).toBe(0);
      expect(getAnimationDuration(500)).toBe(0);
    });
  });

  describe("SSR Safety", () => {
    it("prefersReducedMotion handles undefined window gracefully", () => {
      // Store original window
      const originalWindow = globalThis.window;

      // Temporarily make window undefined
      // @ts-expect-error - intentionally testing SSR scenario
      delete globalThis.window;

      // Should return false without throwing
      expect(prefersReducedMotion()).toBe(false);

      // Restore window
      globalThis.window = originalWindow;
    });
  });
});
