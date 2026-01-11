import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSidebarCollapsedFromStorage,
  saveSidebarCollapsedToStorage,
  getEffectiveSidebarWidth,
  SIDEBAR_OPEN_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
} from "$lib/utils/sidebarWidth";

describe("sidebarWidth", () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    localStorageMock.clear();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  describe("loadSidebarCollapsedFromStorage", () => {
    it("returns false when no value stored", () => {
      expect(loadSidebarCollapsedFromStorage()).toBe(false);
    });

    it('returns true when "true" is stored', () => {
      localStorageMock.setItem("Rackula-sidebar-collapsed", "true");
      expect(loadSidebarCollapsedFromStorage()).toBe(true);
    });

    it("returns false for any other stored value", () => {
      localStorageMock.setItem("Rackula-sidebar-collapsed", "false");
      expect(loadSidebarCollapsedFromStorage()).toBe(false);
    });

    it("returns false when localStorage throws", () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error("localStorage disabled");
      });
      expect(loadSidebarCollapsedFromStorage()).toBe(false);
    });
  });

  describe("saveSidebarCollapsedToStorage", () => {
    it('sets "true" when collapsed is true', () => {
      saveSidebarCollapsedToStorage(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-sidebar-collapsed",
        "true",
      );
    });

    it("removes key when collapsed is false", () => {
      saveSidebarCollapsedToStorage(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "Rackula-sidebar-collapsed",
      );
    });

    it("handles localStorage errors gracefully", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceeded");
      });
      expect(() => saveSidebarCollapsedToStorage(true)).not.toThrow();
    });
  });

  describe("width constants", () => {
    it("open width is 320px", () => {
      expect(SIDEBAR_OPEN_WIDTH).toBe(320);
    });

    it("collapsed width is 40px", () => {
      expect(SIDEBAR_COLLAPSED_WIDTH).toBe(40);
    });
  });

  describe("getEffectiveSidebarWidth", () => {
    it("returns collapsed width when collapsed", () => {
      expect(getEffectiveSidebarWidth(true)).toBe(40);
    });

    it("returns open width when not collapsed", () => {
      expect(getEffectiveSidebarWidth(false)).toBe(320);
    });
  });
});
