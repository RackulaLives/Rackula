import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveSession,
  loadSession,
  clearSession,
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

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = loadSession();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[SessionStorage] Invalid session data format - expected object",
      );

      consoleSpy.mockRestore();
    });
  });
});
