/**
 * Slot-based Collision Detection Tests
 * Tests for half-width device support (#146)
 */

import { describe, it, expect } from "vitest";
import {
  doSlotsOverlap,
  canPlaceDevice,
  type SlotPosition,
} from "$lib/utils/collision";
import type { DeviceType, PlacedDevice, Rack } from "$lib/types";

describe("Slot Collision Detection", () => {
  describe("doSlotsOverlap", () => {
    it("should return true when both positions are full", () => {
      expect(doSlotsOverlap("full", "full")).toBe(true);
    });

    it("should return true when one position is full", () => {
      expect(doSlotsOverlap("full", "left")).toBe(true);
      expect(doSlotsOverlap("full", "right")).toBe(true);
      expect(doSlotsOverlap("left", "full")).toBe(true);
      expect(doSlotsOverlap("right", "full")).toBe(true);
    });

    it("should return true when both positions are the same side", () => {
      expect(doSlotsOverlap("left", "left")).toBe(true);
      expect(doSlotsOverlap("right", "right")).toBe(true);
    });

    it("should return false when positions are on opposite sides", () => {
      expect(doSlotsOverlap("left", "right")).toBe(false);
      expect(doSlotsOverlap("right", "left")).toBe(false);
    });
  });

  describe("Half-width device placement", () => {
    // Helper to create a basic rack
    const createRack = (devices: PlacedDevice[] = []): Rack => ({
      id: "test-rack",
      name: "Test Rack",
      height: 42,
      width: 19,
      desc_units: false,
      show_rear: true,
      form_factor: "4-post",
      starting_unit: 1,
      position: 0,
      devices,
    });

    // Helper to create a full-width device type
    const fullWidthDevice: DeviceType = {
      slug: "full-width-device",
      u_height: 1,
      colour: "#4A90D9",
      category: "server",
      // slot_width defaults to 2 (full)
    };

    // Helper to create a half-width device type
    const halfWidthDevice: DeviceType = {
      slug: "half-width-device",
      u_height: 1,
      colour: "#50FA7B",
      category: "network",
      slot_width: 1,
    };

    const deviceLibrary: DeviceType[] = [fullWidthDevice, halfWidthDevice];

    it("should allow placing two half-width devices in the same U slot", () => {
      const rack = createRack([
        {
          id: "device-1",
          device_type: "half-width-device",
          position: 10,
          face: "front",
          slot_position: "left",
          ports: [],
        },
      ]);

      // Should be able to place another half-width on the right
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1, // height
        10, // position
        undefined, // excludeIndex
        "front", // face
        "right", // slot_position
      );

      expect(canPlace).toBe(true);
    });

    it("should block placing two half-width devices on the same side", () => {
      const rack = createRack([
        {
          id: "device-1",
          device_type: "half-width-device",
          position: 10,
          face: "front",
          slot_position: "left",
          ports: [],
        },
      ]);

      // Should NOT be able to place another half-width on the left
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        10,
        undefined,
        "front",
        "left",
      );

      expect(canPlace).toBe(false);
    });

    it("should block placing half-width when full-width exists at same U", () => {
      const rack = createRack([
        {
          id: "device-1",
          device_type: "full-width-device",
          position: 10,
          face: "front",
          ports: [],
          // slot_position defaults to 'full'
        },
      ]);

      // Should NOT be able to place half-width device
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        10,
        undefined,
        "front",
        "left",
      );

      expect(canPlace).toBe(false);
    });

    it("should block placing full-width when half-width exists at same U", () => {
      const rack = createRack([
        {
          id: "device-1",
          device_type: "half-width-device",
          position: 10,
          face: "front",
          slot_position: "left",
          ports: [],
        },
      ]);

      // Should NOT be able to place full-width device
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        10,
        undefined,
        "front",
        "full",
      );

      expect(canPlace).toBe(false);
    });

    it("should allow devices on front and rear at same position (face-authoritative)", () => {
      const rack = createRack([
        {
          id: "device-1",
          device_type: "half-width-device",
          position: 10,
          face: "front",
          slot_position: "left",
          ports: [],
        },
      ]);

      // Should be able to place on rear (opposite faces don't collide)
      const canPlace = canPlaceDevice(
        rack,
        deviceLibrary,
        1,
        10,
        undefined,
        "rear",
        "left",
      );

      expect(canPlace).toBe(true);
    });
  });
});

describe("SlotPosition runtime behavior", () => {
  it("doSlotsOverlap handles all three slot positions correctly", () => {
    // Test that doSlotsOverlap correctly processes all SlotPosition values
    // This validates runtime behavior rather than just compile-time types
    const positions: SlotPosition[] = ["left", "right", "full"];

    // Each position should work with doSlotsOverlap without errors
    for (const pos of positions) {
      // Same position always overlaps with itself
      expect(doSlotsOverlap(pos, pos)).toBe(true);
    }

    // Verify the expected overlap matrix
    expect(doSlotsOverlap("left", "right")).toBe(false);
    expect(doSlotsOverlap("left", "full")).toBe(true);
    expect(doSlotsOverlap("right", "full")).toBe(true);
  });
});
