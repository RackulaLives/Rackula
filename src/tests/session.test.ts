/**
 * Session utility tests
 * Tests for sessionStorage auto-save functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveToSession,
  loadFromSession,
  clearSession,
  hasSession,
  STORAGE_KEY,
} from "$lib/utils/session";
import { createTestLayout } from "./factories";
import type { Layout } from "$lib/types";

// =============================================================================
// Mock SessionStorage
// =============================================================================

/**
 * Creates a mock sessionStorage for testing.
 * Vitest runs in Node, which doesn't have sessionStorage.
 */
function createMockSessionStorage(): Storage {
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
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
}

describe("Session Utilities", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockSessionStorage();
    vi.stubGlobal("sessionStorage", mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // saveToSession
  // =========================================================================

  describe("saveToSession", () => {
    it("saves valid layout to sessionStorage", () => {
      const layout = createTestLayout({ name: "My Test Layout" });

      saveToSession(layout);

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String),
      );

      // Verify the saved data is valid JSON
      const savedJson = (mockStorage.setItem as ReturnType<typeof vi.fn>).mock
        .calls[0][1];
      const parsed = JSON.parse(savedJson) as Layout;
      expect(parsed.name).toBe("My Test Layout");
    });

    it("serializes layout correctly", () => {
      const layout = createTestLayout({
        name: "Serialization Test",
        racks: [
          {
            id: "rack-1",
            name: "Main Rack",
            height: 24,
            width: 19,
            position: 0,
            desc_units: false,
            form_factor: "4-post",
            starting_unit: 1,
            devices: [],
          },
        ],
      });

      saveToSession(layout);

      const savedJson = (mockStorage.setItem as ReturnType<typeof vi.fn>).mock
        .calls[0][1];
      const parsed = JSON.parse(savedJson) as Layout;

      expect(parsed.racks[0].name).toBe("Main Rack");
      expect(parsed.racks[0].height).toBe(24);
      expect(parsed.racks[0].width).toBe(19);
    });

    it("overwrites existing session", () => {
      const layout1 = createTestLayout({ name: "First Layout" });
      const layout2 = createTestLayout({ name: "Second Layout" });

      saveToSession(layout1);
      saveToSession(layout2);

      expect(mockStorage.setItem).toHaveBeenCalledTimes(2);

      // Get the last saved value
      const lastCall = (mockStorage.setItem as ReturnType<typeof vi.fn>).mock
        .calls[1];
      const parsed = JSON.parse(lastCall[1]) as Layout;
      expect(parsed.name).toBe("Second Layout");
    });

    it("handles sessionStorage not available gracefully", () => {
      // Make setItem throw
      vi.stubGlobal("sessionStorage", {
        ...mockStorage,
        setItem: vi.fn(() => {
          throw new Error("Storage disabled");
        }),
      });

      const layout = createTestLayout();

      // Should not throw
      expect(() => saveToSession(layout)).not.toThrow();
    });

    it("handles quota exceeded gracefully", () => {
      vi.stubGlobal("sessionStorage", {
        ...mockStorage,
        setItem: vi.fn(() => {
          const error = new DOMException(
            "QuotaExceededError",
            "QuotaExceededError",
          );
          throw error;
        }),
      });

      const layout = createTestLayout();

      // Should not throw
      expect(() => saveToSession(layout)).not.toThrow();
    });
  });

  // =========================================================================
  // loadFromSession
  // =========================================================================

  describe("loadFromSession", () => {
    it("loads saved layout", () => {
      const layout = createTestLayout({ name: "Saved Layout" });
      saveToSession(layout);

      const loaded = loadFromSession();

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("Saved Layout");
    });

    it("returns null when no session exists", () => {
      const loaded = loadFromSession();

      expect(loaded).toBeNull();
    });

    it("returns null for empty string in storage", () => {
      (mockStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValueOnce("");

      const loaded = loadFromSession();

      expect(loaded).toBeNull();
    });

    it("handles corrupted/invalid JSON gracefully", () => {
      (mockStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        "not valid json{",
      );

      const loaded = loadFromSession();

      expect(loaded).toBeNull();
    });

    it("handles invalid schema gracefully and clears session", () => {
      // Valid JSON but invalid schema (missing required fields)
      const invalidData = JSON.stringify({ foo: "bar" });
      (mockStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        invalidData,
      );

      const loaded = loadFromSession();

      expect(loaded).toBeNull();
      // Should have called removeItem to clear invalid session
      expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("handles outdated schema format gracefully", () => {
      // Old format without required fields
      const outdatedData = JSON.stringify({
        version: "0.1",
        name: "Old Layout",
        // Missing rack, device_types, settings
      });
      (mockStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        outdatedData,
      );

      const loaded = loadFromSession();

      expect(loaded).toBeNull();
      expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("handles sessionStorage not available gracefully", () => {
      vi.stubGlobal("sessionStorage", {
        getItem: vi.fn(() => {
          throw new Error("Storage disabled");
        }),
        removeItem: vi.fn(),
      });

      const loaded = loadFromSession();

      expect(loaded).toBeNull();
    });

    it("returns full layout structure when valid", () => {
      const layout = createTestLayout({
        version: "1.0",
        name: "Complete Layout",
        racks: [
          {
            id: "rack-1",
            name: "Server Rack",
            height: 42,
            width: 19,
            position: 0,
            desc_units: false,
            form_factor: "4-post",
            starting_unit: 1,
            devices: [
              {
                id: "test-id-1",
                device_type: "test-device",
                position: 10,
                face: "front",
              },
            ],
          },
        ],
        device_types: [
          {
            slug: "test-device",
            u_height: 1,
            model: "Test Device",
            category: "server",
            colour: "#336699",
          },
        ],
        settings: { display_mode: "label", show_labels_on_images: false },
      });
      saveToSession(layout);

      const loaded = loadFromSession();

      expect(loaded).not.toBeNull();
      expect(loaded?.racks[0].devices).toHaveLength(1);
      expect(loaded?.device_types).toHaveLength(1);
      expect(loaded?.settings.display_mode).toBe("label");
    });
  });

  // =========================================================================
  // clearSession
  // =========================================================================

  describe("clearSession", () => {
    it("removes session data from storage", () => {
      const layout = createTestLayout();
      saveToSession(layout);

      clearSession();

      expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("is safe to call when no session exists", () => {
      // Should not throw even when nothing to clear
      expect(() => clearSession()).not.toThrow();
      expect(mockStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });

    it("handles sessionStorage not available gracefully", () => {
      vi.stubGlobal("sessionStorage", {
        removeItem: vi.fn(() => {
          throw new Error("Storage disabled");
        }),
      });

      // Should not throw
      expect(() => clearSession()).not.toThrow();
    });

    it("allows saving new session after clearing", () => {
      const layout1 = createTestLayout({ name: "First" });
      saveToSession(layout1);
      clearSession();

      const layout2 = createTestLayout({ name: "Second" });
      saveToSession(layout2);

      const loaded = loadFromSession();
      expect(loaded?.name).toBe("Second");
    });
  });

  // =========================================================================
  // hasSession
  // =========================================================================

  describe("hasSession", () => {
    it("returns true when valid session exists", () => {
      const layout = createTestLayout();
      saveToSession(layout);

      const result = hasSession();

      expect(result).toBe(true);
    });

    it("returns false when no session exists", () => {
      const result = hasSession();

      expect(result).toBe(false);
    });

    it("returns false for corrupted session data", () => {
      (mockStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        "invalid{json",
      );

      const result = hasSession();

      expect(result).toBe(false);
    });

    it("returns false for invalid schema data", () => {
      const invalidData = JSON.stringify({ invalid: "data" });
      (mockStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        invalidData,
      );

      const result = hasSession();

      expect(result).toBe(false);
    });

    it("returns false when sessionStorage not available", () => {
      vi.stubGlobal("sessionStorage", {
        getItem: vi.fn(() => {
          throw new Error("Storage disabled");
        }),
        removeItem: vi.fn(),
      });

      const result = hasSession();

      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Integration Tests
  // =========================================================================

  describe("Integration", () => {
    it("save -> load -> clear workflow", () => {
      const layout = createTestLayout({ name: "Workflow Test" });

      // Save
      saveToSession(layout);
      expect(hasSession()).toBe(true);

      // Load
      const loaded = loadFromSession();
      expect(loaded?.name).toBe("Workflow Test");

      // Clear
      clearSession();
      expect(hasSession()).toBe(false);
      expect(loadFromSession()).toBeNull();
    });

    it("multiple save/load cycles preserve data integrity", () => {
      for (let i = 1; i <= 3; i++) {
        const layout = createTestLayout({ name: `Cycle ${i}` });
        saveToSession(layout);

        const loaded = loadFromSession();
        expect(loaded?.name).toBe(`Cycle ${i}`);
      }
    });
  });
});
