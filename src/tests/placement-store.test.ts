/**
 * Placement Store Tests
 * Tests for mobile tap-to-place workflow state management
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import type { DeviceType } from "$lib/types";

describe("placement store", () => {
  // Mock device type for testing
  const mockDevice: DeviceType = {
    slug: "test-device",
    manufacturer: "Test",
    model: "Device 1U",
    u_height: 1,
    category: "server",
    colour: "#333333",
    is_full_depth: true,
  };

  const mockHalfDepthDevice: DeviceType = {
    slug: "test-half-depth",
    manufacturer: "Test",
    model: "Switch 1U",
    u_height: 1,
    category: "network",
    colour: "#0066cc",
    is_full_depth: false,
  };

  beforeEach(() => {
    resetPlacementStore();
  });

  describe("initial state", () => {
    it("has isPlacing as false by default", () => {
      const store = getPlacementStore();
      expect(store.isPlacing).toBe(false);
    });

    it("has pendingDevice as null by default", () => {
      const store = getPlacementStore();
      expect(store.pendingDevice).toBeNull();
    });

    it("has targetFace as front by default", () => {
      const store = getPlacementStore();
      expect(store.targetFace).toBe("front");
    });
  });

  describe("startPlacement()", () => {
    it("sets isPlacing to true", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      expect(store.isPlacing).toBe(true);
    });

    it("stores the pending device", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      expect(store.pendingDevice).toEqual(mockDevice);
    });

    it("defaults targetFace to front", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      expect(store.targetFace).toBe("front");
    });

    it("allows specifying target face", () => {
      const store = getPlacementStore();
      store.startPlacement(mockHalfDepthDevice, "rear");
      expect(store.targetFace).toBe("rear");
    });

    it("replaces previous pending device", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      store.startPlacement(mockHalfDepthDevice);
      expect(store.pendingDevice).toEqual(mockHalfDepthDevice);
    });
  });

  describe("cancelPlacement()", () => {
    it("sets isPlacing to false", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      store.cancelPlacement();
      expect(store.isPlacing).toBe(false);
    });

    it("clears pending device", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      store.cancelPlacement();
      expect(store.pendingDevice).toBeNull();
    });

    it("resets targetFace to front", () => {
      const store = getPlacementStore();
      store.startPlacement(mockHalfDepthDevice, "rear");
      store.cancelPlacement();
      expect(store.targetFace).toBe("front");
    });

    it("is safe to call when not placing", () => {
      const store = getPlacementStore();
      expect(() => store.cancelPlacement()).not.toThrow();
      expect(store.isPlacing).toBe(false);
    });
  });

  describe("completePlacement()", () => {
    it("sets isPlacing to false", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      store.completePlacement();
      expect(store.isPlacing).toBe(false);
    });

    it("clears pending device", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice);
      store.completePlacement();
      expect(store.pendingDevice).toBeNull();
    });

    it("resets targetFace to front", () => {
      const store = getPlacementStore();
      store.startPlacement(mockHalfDepthDevice, "rear");
      store.completePlacement();
      expect(store.targetFace).toBe("front");
    });

    it("is safe to call when not placing", () => {
      const store = getPlacementStore();
      expect(() => store.completePlacement()).not.toThrow();
      expect(store.isPlacing).toBe(false);
    });
  });

  describe("setTargetFace()", () => {
    it("updates target face during placement", () => {
      const store = getPlacementStore();
      store.startPlacement(mockHalfDepthDevice);
      store.setTargetFace("rear");
      expect(store.targetFace).toBe("rear");
    });

    it("can switch between faces", () => {
      const store = getPlacementStore();
      store.startPlacement(mockHalfDepthDevice);
      store.setTargetFace("rear");
      store.setTargetFace("front");
      expect(store.targetFace).toBe("front");
    });
  });

  describe("resetPlacementStore()", () => {
    it("resets all state to defaults", () => {
      const store = getPlacementStore();
      store.startPlacement(mockDevice, "rear");

      resetPlacementStore();

      expect(store.isPlacing).toBe(false);
      expect(store.pendingDevice).toBeNull();
      expect(store.targetFace).toBe("front");
    });
  });
});
