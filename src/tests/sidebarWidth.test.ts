import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadSidebarWidthFromStorage,
  saveSidebarWidthToStorage,
  loadSidebarCollapsedFromStorage,
  saveSidebarCollapsedToStorage,
  getPresetWidth,
  getEffectiveSidebarWidth,
  SIDEBAR_WIDTHS,
  SIDEBAR_COLLAPSED_WIDTH,
  type SidebarWidthPreset as _SidebarWidthPreset,
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
    it('returns "normal" when no value stored', () => {
      expect(loadSidebarWidthFromStorage()).toBe("normal");
    });

    it('returns stored "compact" value', () => {
      localStorageMock.setItem("Rackula-sidebar-width", "compact");
      expect(loadSidebarWidthFromStorage()).toBe("compact");
    });

    it('returns stored "wide" value', () => {
      localStorageMock.setItem("Rackula-sidebar-width", "wide");
      expect(loadSidebarWidthFromStorage()).toBe("wide");
    });

    it('returns "normal" for invalid stored value', () => {
      localStorageMock.setItem("Rackula-sidebar-width", "invalid");
      expect(loadSidebarWidthFromStorage()).toBe("normal");
    });

    it('returns "normal" when localStorage throws', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error("localStorage disabled");
      });
      expect(loadSidebarWidthFromStorage()).toBe("normal");
    });
  });

  describe("saveSidebarWidthToStorage", () => {
    it('saves "compact" to localStorage', () => {
      saveSidebarWidthToStorage("compact");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-sidebar-width",
        "compact",
      );
    });

    it('saves "normal" to localStorage', () => {
      saveSidebarWidthToStorage("normal");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-sidebar-width",
        "normal",
      );
    });

    it('saves "wide" to localStorage', () => {
      saveSidebarWidthToStorage("wide");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "Rackula-sidebar-width",
        "wide",
      );
    });

    it("handles localStorage errors gracefully", () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error("QuotaExceeded");
      });
      // Should not throw
      expect(() => saveSidebarWidthToStorage("wide")).not.toThrow();
    });
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

  describe("SIDEBAR_WIDTHS constants", () => {
    it("has correct width values", () => {
      expect(SIDEBAR_WIDTHS.compact).toBe(200);
      expect(SIDEBAR_WIDTHS.normal).toBe(280);
      expect(SIDEBAR_WIDTHS.wide).toBe(400);
    });

    it("collapsed width is 40px", () => {
      expect(SIDEBAR_COLLAPSED_WIDTH).toBe(40);
    });
  });

  describe("getPresetWidth", () => {
    it("returns correct width for compact", () => {
      expect(getPresetWidth("compact")).toBe(200);
    });

    it("returns correct width for normal", () => {
      expect(getPresetWidth("normal")).toBe(280);
    });

    it("returns correct width for wide", () => {
      expect(getPresetWidth("wide")).toBe(400);
    });
  });

  describe("getEffectiveSidebarWidth", () => {
    it("returns collapsed width when collapsed", () => {
      expect(getEffectiveSidebarWidth("normal", true)).toBe(40);
      expect(getEffectiveSidebarWidth("wide", true)).toBe(40);
      expect(getEffectiveSidebarWidth("compact", true)).toBe(40);
    });

    it("returns preset width when not collapsed", () => {
      expect(getEffectiveSidebarWidth("compact", false)).toBe(200);
      expect(getEffectiveSidebarWidth("normal", false)).toBe(280);
      expect(getEffectiveSidebarWidth("wide", false)).toBe(400);
    });
  });
});
