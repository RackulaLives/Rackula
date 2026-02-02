import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveSession,
  loadSession,
  loadSessionWithTimestamp,
  clearSession,
  isServerNewer,
} from "$lib/utils/session-storage";
import type { Layout } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";

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
    it("saves layout to localStorage with timestamp wrapper", () => {
      const result = saveSession(mockLayout);

      expect(result).toBe(true);
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      // New format: { layout: Layout, savedAt: string }
      expect(parsed.layout).toEqual(mockLayout);
      expect(parsed.savedAt).toBeDefined();
      expect(typeof parsed.savedAt).toBe("string");
      // Verify it's a valid ISO timestamp
      expect(new Date(parsed.savedAt).toISOString()).toBe(parsed.savedAt);
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

      const result = saveSession(mockLayout);

      // Should return false on error (logs via debug logger, not console.warn)
      expect(result).toBe(false);

      // Restore original implementation
      localStorage.setItem = originalSetItem;
    });

    it("overwrites existing session with new timestamp", () => {
      // Use fake timers for deterministic timestamp testing
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-02-01T12:00:00.000Z"));

        saveSession(mockLayout);
        const firstStored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(firstStored.savedAt).toBe("2026-02-01T12:00:00.000Z");

        vi.advanceTimersByTime(1000);

        const updatedLayout: Layout = {
          racks: [{ id: "rack-1", name: "Updated Rack", height: 24, devices: [] }],
        } as Layout;
        saveSession(updatedLayout);

        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(parsed.layout).toEqual(updatedLayout);
        expect(parsed.savedAt).toBe("2026-02-01T12:00:01.000Z");
      } finally {
        vi.useRealTimers();
      }
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

      const result = loadSession();

      // Should return null on parse error (logs via debug logger)
      expect(result).toBeNull();
    });

    it("handles localStorage errors gracefully", () => {
      // Mock localStorage.getItem to throw an error
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn(() => {
        throw new Error("Storage error");
      });

      const result = loadSession();

      // Should return null on error (logs via debug logger)
      expect(result).toBeNull();

      // Restore original implementation
      localStorage.getItem = originalGetItem;
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

      // Should not throw (logs via debug logger)
      expect(() => clearSession()).not.toThrow();

      // Restore original implementation
      localStorage.removeItem = originalRemoveItem;
    });
  });

  describe("loadSessionWithTimestamp", () => {
    it("returns null when no session exists", () => {
      const result = loadSessionWithTimestamp();
      expect(result).toBeNull();
    });

    it("loads new format with timestamp", () => {
      const timestamp = "2026-02-01T12:00:00.000Z";
      const sessionData = {
        layout: mockLayout,
        savedAt: timestamp,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));

      const result = loadSessionWithTimestamp();
      expect(result).not.toBeNull();
      expect(result!.layout).toEqual(mockLayout);
      expect(result!.savedAt).toBe(timestamp);
    });

    it("loads legacy format without timestamp", () => {
      // Legacy format: direct layout object without wrapper
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockLayout));

      const result = loadSessionWithTimestamp();
      expect(result).not.toBeNull();
      expect(result!.layout).toEqual(mockLayout);
      expect(result!.savedAt).toBeNull(); // Legacy data has no timestamp
    });
  });

  describe("isServerNewer", () => {
    it("returns true when local timestamp is null (legacy data)", () => {
      const serverTime = "2026-02-01T12:00:00.000Z";
      expect(isServerNewer(null, serverTime)).toBe(true);
    });

    it("returns true when server is newer", () => {
      const localTime = "2026-02-01T10:00:00.000Z";
      const serverTime = "2026-02-01T12:00:00.000Z";
      expect(isServerNewer(localTime, serverTime)).toBe(true);
    });

    it("returns false when local is newer", () => {
      const localTime = "2026-02-01T14:00:00.000Z";
      const serverTime = "2026-02-01T12:00:00.000Z";
      expect(isServerNewer(localTime, serverTime)).toBe(false);
    });

    it("returns false when timestamps are equal", () => {
      const timestamp = "2026-02-01T12:00:00.000Z";
      expect(isServerNewer(timestamp, timestamp)).toBe(false);
    });

    it("returns true for invalid local timestamp", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const serverTime = "2026-02-01T12:00:00.000Z";
      expect(isServerNewer("invalid-date", serverTime)).toBe(true);
      consoleSpy.mockRestore();
    });

    it("returns true for invalid server timestamp", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const localTime = "2026-02-01T12:00:00.000Z";
      expect(isServerNewer(localTime, "invalid-date")).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe("Integration", () => {
    it("round-trips save and load", () => {
      saveSession(mockLayout);
      const loaded = loadSession();
      expect(loaded).toEqual(mockLayout);
    });

    it("round-trips save and loadWithTimestamp", () => {
      saveSession(mockLayout);
      const result = loadSessionWithTimestamp();
      expect(result).not.toBeNull();
      expect(result!.layout).toEqual(mockLayout);
      expect(result!.savedAt).toBeDefined();
    });

    it("clear removes saved session", () => {
      saveSession(mockLayout);
      expect(loadSession()).toEqual(mockLayout);

      clearSession();
      expect(loadSession()).toBeNull();
    });
  });

  describe("Legacy format migration", () => {
    it("migrates legacy rack format to racks array", () => {
      // Simulate v0.6.16 localStorage data with single `rack` property
      const legacyData = {
        version: "0.6.16",
        name: "Test Layout",
        rack: {
          id: "rack-1",
          name: "Main Rack",
          height: 42,
          width: 19,
          devices: [],
          form_factor: "two-post",
          starting_unit: 1,
          position: 0,
          desc_units: false,
          show_rear: true,
        },
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));

      const result = loadSession();

      expect(result).not.toBeNull();
      expect(result!.racks).toBeDefined();
      // eslint-disable-next-line no-restricted-syntax -- migration should produce exactly 1 rack
      expect(result!.racks).toHaveLength(1);
      expect(result!.racks[0].name).toBe("Main Rack");
      // Legacy 'rack' property should not exist on migrated layout
      expect((result as Record<string, unknown>).rack).toBeUndefined();
    });

    it("handles modern racks array format unchanged", () => {
      const modernData = {
        version: "0.7.0",
        name: "Test Layout",
        racks: [
          {
            id: "rack-1",
            name: "Main Rack",
            height: 42,
            width: 19,
            devices: [],
            form_factor: "two-post",
            starting_unit: 1,
            position: 0,
            desc_units: false,
            show_rear: true,
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(modernData));

      const result = loadSession();

      expect(result).not.toBeNull();
      // eslint-disable-next-line no-restricted-syntax -- verifying migration preserves exact count
      expect(result!.racks).toHaveLength(1);
    });

    it("migrates position values for pre-0.7.0 layouts", () => {
      // Pre-0.7.0 layouts used U-values directly (e.g., position: 1 meant U1)
      // Post-0.7.0 uses internal units (e.g., position: 6 for U1)
      const legacyData = {
        version: "0.6.16",
        name: "Test Layout",
        rack: {
          id: "rack-1",
          name: "Main Rack",
          height: 42,
          width: 19,
          devices: [
            {
              id: "device-1",
              device_type: "server-1u",
              position: 1, // U1 in old format
              face: "front",
              ports: [],
            },
            {
              id: "device-2",
              device_type: "server-2u",
              position: 10, // U10 in old format
              face: "front",
              ports: [],
            },
          ],
          form_factor: "two-post",
          starting_unit: 1,
          position: 0,
          desc_units: false,
          show_rear: true,
        },
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));

      const result = loadSession();

      expect(result).not.toBeNull();
      // Position values should be multiplied by UNITS_PER_U
      expect(result!.racks[0].devices[0].position).toBe(1 * UNITS_PER_U);
      expect(result!.racks[0].devices[1].position).toBe(10 * UNITS_PER_U);
    });

    it("does not migrate container child positions", () => {
      // Container children use 0-indexed positions relative to container
      // These should NOT be multiplied
      const legacyData = {
        version: "0.6.16",
        name: "Test Layout",
        rack: {
          id: "rack-1",
          name: "Main Rack",
          height: 42,
          width: 19,
          devices: [
            {
              id: "container-1",
              device_type: "blade-chassis",
              position: 5, // U5 in old format - should be migrated
              face: "front",
              ports: [],
            },
            {
              id: "blade-1",
              device_type: "blade-server",
              position: 2, // Relative to container (0-indexed row 2) - should NOT be migrated
              container_id: "container-1",
              slot_id: "bay-1",
              face: "front",
              ports: [],
            },
          ],
          form_factor: "two-post",
          starting_unit: 1,
          position: 0,
          desc_units: false,
          show_rear: true,
        },
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));

      const result = loadSession();

      expect(result).not.toBeNull();
      // Container position should be migrated
      expect(result!.racks[0].devices[0].position).toBe(5 * UNITS_PER_U);
      // Child position should NOT be migrated (remains 2)
      expect(result!.racks[0].devices[1].position).toBe(2);
    });

    it("does not migrate positions for v0.7.0+ layouts", () => {
      // Layouts >= 0.7.0 already have internal units
      const modernData = {
        version: "0.7.0",
        name: "Test Layout",
        racks: [
          {
            id: "rack-1",
            name: "Main Rack",
            height: 42,
            width: 19,
            devices: [
              {
                id: "device-1",
                device_type: "server-1u",
                position: 6, // Already in internal units (U1)
                face: "front",
                ports: [],
              },
            ],
            form_factor: "two-post",
            starting_unit: 1,
            position: 0,
            desc_units: false,
            show_rear: true,
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(modernData));

      const result = loadSession();

      expect(result).not.toBeNull();
      // Position should remain unchanged
      expect(result!.racks[0].devices[0].position).toBe(6);
    });

    it("returns null for non-object parsed data", () => {
      // Store valid JSON but not an object (array case)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

      const result = loadSession();

      // Should return null for non-object data (logs via debug logger)
      expect(result).toBeNull();
    });
  });
});
