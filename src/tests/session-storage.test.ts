import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveSession,
  loadSession,
  clearSession,
} from "$lib/utils/session-storage";
import type { Layout } from "$lib/types";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("Session Storage", () => {
  const STORAGE_KEY = "Rackula:autosave";

  // Mock layout for testing
  const mockLayout: Layout = {
    racks: [
      {
        id: "rack-0",
        name: "Test Rack",
        height: 42,
        devices: [],
      },
    ],
  } as Layout;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();
  });

  afterEach(() => {
    // Clean up after each test
    localStorageMock.clear();
  });

  describe("saveSession", () => {
    it("saves layout to localStorage", () => {
      const result = saveSession(mockLayout);

      expect(result).toBe(true);
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(mockLayout);
    });

    it("returns true on successful save", () => {
      const result = saveSession(mockLayout);
      expect(result).toBe(true);
    });

    it("handles QuotaExceededError gracefully", () => {
      // Mock localStorage.setItem to throw QuotaExceededError
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = saveSession(mockLayout);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[SessionStorage] Failed to save session:",
        expect.any(Error),
      );

      // Restore original implementation
      localStorage.setItem = originalSetItem;
      consoleSpy.mockRestore();
    });

    it("overwrites existing session", () => {
      // Save first layout
      saveSession(mockLayout);

      // Save updated layout
      const updatedLayout: Layout = {
        racks: [
          {
            id: "rack-1",
            name: "Updated Rack",
            height: 24,
            devices: [],
          },
        ],
      } as Layout;
      saveSession(updatedLayout);

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(JSON.parse(stored!)).toEqual(updatedLayout);
    });
  });

  describe("loadSession", () => {
    it("returns null when no session exists", () => {
      const result = loadSession();
      expect(result).toBeNull();
    });

    it("loads saved layout from localStorage", () => {
      // Save a session first
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockLayout));

      const result = loadSession();
      expect(result).toEqual(mockLayout);
    });

    it("returns null on invalid JSON", () => {
      // Store invalid JSON
      localStorage.setItem(STORAGE_KEY, "invalid-json");

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = loadSession();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[SessionStorage] Failed to load session:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("handles localStorage errors gracefully", () => {
      // Mock localStorage.getItem to throw an error
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn(() => {
        throw new Error("Storage error");
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = loadSession();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[SessionStorage] Failed to load session:",
        expect.any(Error),
      );

      // Restore original implementation
      localStorage.getItem = originalGetItem;
      consoleSpy.mockRestore();
    });
  });

  describe("clearSession", () => {
    it("removes session from localStorage", () => {
      // Save a session first
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockLayout));
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

      clearSession();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("does not throw when no session exists", () => {
      expect(() => clearSession()).not.toThrow();
    });

    it("handles localStorage errors gracefully", () => {
      // Mock localStorage.removeItem to throw an error
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = vi.fn(() => {
        throw new Error("Storage error");
      });

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => clearSession()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[SessionStorage] Failed to clear session:",
        expect.any(Error),
      );

      // Restore original implementation
      localStorage.removeItem = originalRemoveItem;
      consoleSpy.mockRestore();
    });
  });

  describe("Integration", () => {
    it("round-trips save and load", () => {
      saveSession(mockLayout);
      const loaded = loadSession();
      expect(loaded).toEqual(mockLayout);
    });

    it("clear removes saved session", () => {
      saveSession(mockLayout);
      expect(loadSession()).toEqual(mockLayout);

      clearSession();
      expect(loadSession()).toBeNull();
    });
  });
});
