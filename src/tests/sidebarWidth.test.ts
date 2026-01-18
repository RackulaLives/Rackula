import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSidebarWidthFromStorage,
  saveSidebarWidthToStorage,
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

  describe("loadSidebarWidthFromStorage", () => {
    it("returns null when no value stored", () => {
      expect(loadSidebarWidthFromStorage()).toBe(null);
    });

    it("returns stored width as number", () => {
      localStorageMock.setItem("Rackula-sidebar-width", "350");
      expect(loadSidebarWidthFromStorage()).toBe(350);
    });

    it("returns null for invalid stored value", () => {
      localStorageMock.setItem("Rackula-sidebar-width", "invalid");
      expect(loadSidebarWidthFromStorage()).toBe(null);
    });

    it("returns null for zero or negative width", () => {
      localStorageMock.setItem("Rackula-sidebar-width", "0");
      expect(loadSidebarWidthFromStorage()).toBe(null);

      localStorageMock.setItem("Rackula-sidebar-width", "-100");
      expect(loadSidebarWidthFromStorage()).toBe(null);
    });

    it("returns null when localStorage throws", () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error("localStorage disabled");
      });
      expect(loadSidebarWidthFromStorage()).toBe(null);
    });
  });

  describe("saveSidebarWidthToStorage", () => {
    it("saves width as string", () => {
      saveSidebarWidthToStorage(320);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-sidebar-width",
        "320",
      );
    });

    it("rounds fractional widths", () => {
      saveSidebarWidthToStorage(320.7);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-sidebar-width",
        "321",
      );
    });

    it("handles localStorage errors gracefully", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceeded");
      });
      expect(() => saveSidebarWidthToStorage(320)).not.toThrow();
    });
  });
});
