/**
 * Blocked Slots Unit Tests
 *
 * Tests for the blocked-slots utility that calculates which U slots
 * are blocked by half-depth devices on the opposite face.
 */

import { describe, it, expect } from "vitest";
import {
  getBlockedSlots,
  isPositionBlocked,
  wouldOverlapBlocked,
} from "$lib/utils/blocked-slots";
import type { URange } from "$lib/utils/collision";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

describe("getBlockedSlots", () => {
  describe("unit conversion", () => {
    it("converts internal position units to human U positions correctly", () => {
      // Create a half-depth device at U8
      // Note: createTestDevice accepts human units and converts internally
      const rack = createTestRack({
        height: 42,
        devices: [
          createTestDevice({
            device_type: "half-depth-panel",
            position: 8, // Human units - factory converts to internal
            face: "front",
          }),
        ],
      });

      const deviceLibrary = [
        createTestDeviceType({
          slug: "half-depth-panel",
          u_height: 2,
          is_full_depth: false, // Half-depth device
        }),
      ];

      // Get blocked slots for rear view (should show front half-depth devices)
      const blockedSlots = getBlockedSlots(rack, "rear", deviceLibrary);

      // Should have one blocked range
      expect(blockedSlots.length).toBe(1);

      // The blocked range should be in human units (U8 to U9 for a 2U device)
      // This tests that internal units (48) are converted back to human units (8)
      const blocked = blockedSlots[0];
      expect(blocked.bottom).toBe(8); // U8 in human units, not 48 in internal units
      expect(blocked.top).toBe(9); // U8 + 2 - 1 = U9
    });

    it("handles 1U half-depth device at U1", () => {
      const rack = createTestRack({
        height: 42,
        devices: [
          createTestDevice({
            device_type: "half-depth-1u",
            position: 1, // U1
            face: "rear",
          }),
        ],
      });

      const deviceLibrary = [
        createTestDeviceType({
          slug: "half-depth-1u",
          u_height: 1,
          is_full_depth: false,
        }),
      ];

      // Get blocked slots for front view
      const blockedSlots = getBlockedSlots(rack, "front", deviceLibrary);

      expect(blockedSlots.length).toBe(1);
      expect(blockedSlots[0].bottom).toBe(1);
      expect(blockedSlots[0].top).toBe(1);
    });

    it("handles multiple half-depth devices", () => {
      const rack = createTestRack({
        height: 42,
        devices: [
          createTestDevice({
            device_type: "half-depth-panel",
            position: 5, // U5
            face: "front",
          }),
          createTestDevice({
            device_type: "half-depth-panel",
            position: 20, // U20
            face: "front",
          }),
        ],
      });

      const deviceLibrary = [
        createTestDeviceType({
          slug: "half-depth-panel",
          u_height: 2,
          is_full_depth: false,
        }),
      ];

      const blockedSlots = getBlockedSlots(rack, "rear", deviceLibrary);

      expect(blockedSlots.length).toBe(2);
      // First device at U5-U6
      expect(blockedSlots[0].bottom).toBe(5);
      expect(blockedSlots[0].top).toBe(6);
      // Second device at U20-U21
      expect(blockedSlots[1].bottom).toBe(20);
      expect(blockedSlots[1].top).toBe(21);
    });
  });

  describe("filtering", () => {
    it("excludes full-depth devices", () => {
      const rack = createTestRack({
        height: 42,
        devices: [
          createTestDevice({
            device_type: "full-depth-server",
            position: 10, // U10
            face: "front",
          }),
        ],
      });

      const deviceLibrary = [
        createTestDeviceType({
          slug: "full-depth-server",
          u_height: 2,
          is_full_depth: true, // Full-depth, not half-depth
        }),
      ];

      const blockedSlots = getBlockedSlots(rack, "rear", deviceLibrary);

      // Full-depth devices are visible from both sides, no blocking
      expect(blockedSlots.length).toBe(0);
    });

    it("excludes devices on the same face", () => {
      const rack = createTestRack({
        height: 42,
        devices: [
          createTestDevice({
            device_type: "half-depth-panel",
            position: 10, // U10
            face: "front",
          }),
        ],
      });

      const deviceLibrary = [
        createTestDeviceType({
          slug: "half-depth-panel",
          u_height: 2,
          is_full_depth: false,
        }),
      ];

      // Looking at front view - front devices are visible, not blocked
      const blockedSlots = getBlockedSlots(rack, "front", deviceLibrary);

      expect(blockedSlots.length).toBe(0);
    });

    it('excludes devices with face="both"', () => {
      const rack = createTestRack({
        height: 42,
        devices: [
          createTestDevice({
            device_type: "both-face-device",
            position: 10, // U10
            face: "both",
          }),
        ],
      });

      const deviceLibrary = [
        createTestDeviceType({
          slug: "both-face-device",
          u_height: 2,
          is_full_depth: false,
        }),
      ];

      // Both-face devices are visible from both sides
      const blockedSlots = getBlockedSlots(rack, "rear", deviceLibrary);

      expect(blockedSlots.length).toBe(0);
    });
  });
});

// These pin the edge-inclusive overlap semantics after #2670 routed the checks
// through doRangesOverlap. A device touching a blocked range edge counts as
// overlapping (the whole-U invariant depends on it); a device strictly adjacent
// does not.
describe("isPositionBlocked", () => {
  const blocked: URange[] = [{ bottom: 5, top: 9 }];

  it("treats the range edges as blocked (inclusive)", () => {
    expect(isPositionBlocked(blocked, 5)).toBe(true);
    expect(isPositionBlocked(blocked, 9)).toBe(true);
  });

  it("treats positions inside the range as blocked", () => {
    expect(isPositionBlocked(blocked, 7)).toBe(true);
  });

  it("treats positions outside the range as not blocked", () => {
    expect(isPositionBlocked(blocked, 4)).toBe(false);
    expect(isPositionBlocked(blocked, 10)).toBe(false);
  });
});

describe("wouldOverlapBlocked", () => {
  const blocked: URange[] = [{ bottom: 5, top: 9 }];

  it("reports overlap when the device touches the bottom edge", () => {
    // Device spans U4-U5: its top edge touches the blocked bottom (U5).
    expect(wouldOverlapBlocked(blocked, 4, 2)).toBe(true);
  });

  it("reports overlap when the device touches the top edge", () => {
    // Device spans U9-U10: its bottom edge touches the blocked top (U9).
    expect(wouldOverlapBlocked(blocked, 9, 2)).toBe(true);
  });

  it("reports overlap when the device spans the entire range", () => {
    expect(wouldOverlapBlocked(blocked, 3, 10)).toBe(true);
  });

  it("reports no overlap when the device is strictly above the range", () => {
    // Device spans U10-U11: strictly above the blocked range (5-9).
    expect(wouldOverlapBlocked(blocked, 10, 2)).toBe(false);
  });

  it("reports no overlap when the device is strictly below the range", () => {
    // Device spans U3-U4: strictly below the blocked range (5-9).
    expect(wouldOverlapBlocked(blocked, 3, 2)).toBe(false);
  });
});
