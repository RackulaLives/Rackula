/**
 * Viewport Utility Tests
 * Tests for mobile/desktop viewport detection
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isMobile,
  getViewportStore,
  resetViewportStore,
} from "$lib/utils/viewport.svelte";

describe("viewport utility", () => {
  beforeEach(() => {
    // Reset window.matchMedia mock and viewport store
    vi.clearAllMocks();
    resetViewportStore();
  });

  describe("isMobile()", () => {
    it("returns true when viewport is <= 1024px", () => {
      // Mock matchMedia to return true (mobile)
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 1024px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(isMobile()).toBe(true);
    });

    it("returns false when viewport is > 1024px", () => {
      // Mock matchMedia to return false (desktop)
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      expect(isMobile()).toBe(false);
    });
  });

  describe("getViewportStore()", () => {
    it("provides isMobile getter", () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 1024px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const store = getViewportStore();
      expect(store.isMobile).toBe(true);
    });

    it("updates isMobile when viewport changes", () => {
      let matchResult = false;
      let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;

      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: matchResult,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event, handler) => {
          if (event === "change") {
            changeHandler = handler as (e: MediaQueryListEvent) => void;
          }
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const store = getViewportStore();
      expect(store.isMobile).toBe(false);

      // Simulate viewport change to mobile
      matchResult = true;
      if (changeHandler) {
        (changeHandler as (e: MediaQueryListEvent) => void)({
          matches: true,
        } as MediaQueryListEvent);
      }

      expect(store.isMobile).toBe(true);
    });
  });
});
