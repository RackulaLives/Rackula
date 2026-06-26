/**
 * Unit tests for the keyboard-placement cursor maths (#106).
 * These cover the navigation edge cases: collision-aware valid slots,
 * clamping at the rack ends, preferred-slot snapping when switching racks,
 * and recovery when the cursor drifts off a now-invalid slot.
 */
import { describe, it, expect } from "vitest";
import {
  validStartPositions,
  initialCursorPosition,
  nextCursorPosition,
} from "$lib/utils/placement-keyboard";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";

const oneU = createTestDeviceType({ slug: "switch", u_height: 1 });
const twoU = createTestDeviceType({
  slug: "server",
  u_height: 2,
  is_full_depth: false,
});

describe("validStartPositions", () => {
  it("lists every whole-U slot in an empty rack for a 1U device", () => {
    const rack = createTestRack({ height: 5, devices: [] });
    expect(validStartPositions(rack, [oneU], oneU, "front")).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("excludes slots where a taller device would overrun the top", () => {
    const rack = createTestRack({ height: 5, devices: [] });
    // A 2U device can start at U1..U4 but not U5 (would need U5 and U6).
    expect(validStartPositions(rack, [twoU], twoU, "front")).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("omits slots occupied by an existing device on the same face", () => {
    const rack = createTestRack({
      height: 5,
      devices: [
        createTestDevice({ device_type: "server", position: 2, face: "front" }),
      ],
    });
    // The 2U server sits at U2-U3, so a 1U device cannot start at U2 or U3.
    expect(validStartPositions(rack, [twoU, oneU], oneU, "front")).toEqual([
      1, 4, 5,
    ]);
  });

  it("treats the opposite face as free (face-aware collisions)", () => {
    const rack = createTestRack({
      height: 5,
      devices: [
        createTestDevice({ device_type: "server", position: 2, face: "rear" }),
      ],
    });
    // The rear-mounted server does not block the front face.
    expect(validStartPositions(rack, [twoU, oneU], oneU, "front")).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("returns an empty list when the device cannot fit at all", () => {
    const rack = createTestRack({ height: 1, devices: [] });
    expect(validStartPositions(rack, [twoU], twoU, "front")).toEqual([]);
  });
});

describe("initialCursorPosition", () => {
  it("returns the lowest valid slot with no preference", () => {
    expect(initialCursorPosition([2, 4, 6])).toBe(2);
  });

  it("snaps to the nearest valid slot to the preferred position", () => {
    expect(initialCursorPosition([1, 4, 8], 5)).toBe(4);
  });

  it("picks the lower slot when two are equidistant from the preference", () => {
    expect(initialCursorPosition([2, 4], 3)).toBe(2);
  });

  it("returns null when there are no valid slots", () => {
    expect(initialCursorPosition([], 3)).toBeNull();
  });
});

describe("nextCursorPosition", () => {
  const valid = [1, 3, 5, 7];

  it("moves up to the next valid slot", () => {
    expect(nextCursorPosition(valid, 3, 1)).toBe(5);
  });

  it("moves down to the previous valid slot", () => {
    expect(nextCursorPosition(valid, 5, -1)).toBe(3);
  });

  it("stays at the top slot rather than wrapping", () => {
    expect(nextCursorPosition(valid, 7, 1)).toBe(7);
  });

  it("stays at the bottom slot rather than wrapping", () => {
    expect(nextCursorPosition(valid, 1, -1)).toBe(1);
  });

  it("enters at the lowest slot when no cursor is set yet", () => {
    expect(nextCursorPosition(valid, null, 1)).toBe(1);
  });

  it("snaps to the nearest valid slot when the cursor drifted off one", () => {
    // 4 is not in the valid list (e.g. a device was placed there): snap, not
    // index-from-stale.
    expect(nextCursorPosition(valid, 4, 1)).toBe(3);
  });

  it("returns null when there are no valid slots", () => {
    expect(nextCursorPosition([], 3, 1)).toBeNull();
  });
});
