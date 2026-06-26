import { describe, it, expect } from "vitest";
import { canPlaceDevice, findCollisions } from "$lib/utils/collision";
import { toInternalUnits } from "$lib/utils/position";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";

describe("collision treats full-depth devices as occupying both faces (#2337)", () => {
  it("rejects a rear placement behind a full-depth device stored as front-only", () => {
    // is_full_depth omitted -> full-depth.
    const fullDepth = createTestDeviceType({ slug: "srv", u_height: 1 });
    const rack = createTestRack({
      devices: [
        createTestDevice({ device_type: "srv", position: 5, face: "front" }),
      ],
    });

    // Old behaviour: opposite explicit faces never collide -> would be true.
    expect(
      canPlaceDevice(
        rack,
        [fullDepth],
        1,
        toInternalUnits(5),
        undefined,
        "rear",
      ),
    ).toBe(false);

    const blockers = findCollisions(
      rack,
      [fullDepth],
      1,
      toInternalUnits(5),
      undefined,
      "rear",
    );
    expect(blockers.map((b) => b.device_type)).toContain("srv");
  });

  it("still allows a rear placement behind a half-depth front device", () => {
    const halfDepth = createTestDeviceType({
      slug: "shallow",
      u_height: 1,
      is_full_depth: false,
    });
    const rack = createTestRack({
      devices: [
        createTestDevice({
          device_type: "shallow",
          position: 5,
          face: "front",
        }),
      ],
    });

    expect(
      canPlaceDevice(
        rack,
        [halfDepth],
        1,
        toInternalUnits(5),
        undefined,
        "rear",
      ),
    ).toBe(true);
  });
});
