/**
 * Container Collision Detection Tests
 *
 * Tests for hierarchical collision rules per Epic #159 Design Principles:
 * - Container devices collide at rack level (they occupy space)
 * - Child devices collide ONLY within their container
 * - Child devices are INVISIBLE to rack-level collision
 */
import { describe, it, expect } from "vitest";
import {
  canPlaceDevice,
  findCollisions,
  findValidDropPositions,
  canPlaceInContainer,
  isContainerChild,
} from "$lib/utils/collision";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
  createTestContainerType,
  createTestContainerChild,
} from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import type { PlacedDevice, DeviceType, Rack } from "$lib/types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a rack with a container device and optionally child devices
 */
function createRackWithContainer(
  containerPosition: number,
  children: Partial<PlacedDevice>[] = [],
): { rack: Rack; deviceLibrary: DeviceType[] } {
  const containerType = createTestContainerType({
    slug: "blade-chassis",
    u_height: 4,
  });
  const childType = createTestDeviceType({ slug: "blade-server", u_height: 1 });

  const containerId = "container-1";
  const containerDevice = createTestDevice({
    id: containerId,
    device_type: "blade-chassis",
    position: containerPosition,
    face: "front",
  });

  const childDevices = children.map((child, idx) =>
    createTestContainerChild({
      id: child.id ?? `child-${idx + 1}`,
      device_type: child.device_type ?? "blade-server",
      container_id: containerId,
      slot_id: child.slot_id ?? "slot-left",
      position: child.position ?? 0,
      face: child.face ?? "front",
    }),
  );

  const rack = createTestRack({
    height: 42,
    devices: [containerDevice, ...childDevices],
  });

  return { rack, deviceLibrary: [containerType, childType] };
}

// =============================================================================
// isContainerChild Tests
// =============================================================================

describe("isContainerChild", () => {
  it("returns true when device has container_id set", () => {
    const child = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
    });
    expect(isContainerChild(child)).toBe(true);
  });

  it("returns false when device has no container_id", () => {
    const rackDevice = createTestDevice({ position: 5 });
    // Verify createTestDevice doesn't set container_id
    expect(rackDevice.container_id).toBeUndefined();
    expect(isContainerChild(rackDevice)).toBe(false);
  });
});

// =============================================================================
// Rack-Level Collision with Container Devices
// =============================================================================

describe("Container devices at rack level", () => {
  it("container devices collide at rack level (existing behavior)", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5);
    // Container is at 5-8 (4U), trying to place at 7 should fail
    expect(canPlaceDevice(rack, deviceLibrary, 2, toInternalUnits(7))).toBe(
      false,
    );
  });

  it("container devices block adjacent rack-level placements correctly", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5);
    // Container is at 5-8 (4U), position 9 should be free
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(9))).toBe(
      true,
    );
    // Position 4 should also be free
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(4))).toBe(
      true,
    );
  });

  it("rack-level devices still block container placement", () => {
    const serverType = createTestDeviceType({ slug: "server-1u", u_height: 1 });
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const rack = createTestRack({
      height: 42,
      devices: [
        createTestDevice({
          device_type: "server-1u",
          position: 10,
        }),
      ],
    });

    // Container at 8-11 would overlap with server at 10
    expect(
      canPlaceDevice(rack, [serverType, containerType], 4, toInternalUnits(8)),
    ).toBe(false);
  });
});

// =============================================================================
// Child Devices Excluded from Rack-Level Collision
// =============================================================================

describe("Child devices excluded from rack-level collision", () => {
  it("child devices do not block rack-level placements", () => {
    // Container at position 5-8, with a child at position 0 in slot-left
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    // Even though child exists, rack-level placement should work at position 10
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(10))).toBe(
      true,
    );
  });

  it("rack-level device does not collide with child device at same U", () => {
    // Container at 5-8, child inside at relative position 0
    // The child occupies physical U=5 within the container
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    // Placing at position 5 still blocked by container, not by child
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(5))).toBe(
      false,
    );

    // But position 10 is valid - child doesn't block it
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(10))).toBe(
      true,
    );
  });

  it("findCollisions does not include child devices", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    // Collisions at position 5 should only include the container, not the child
    const collisions = findCollisions(
      rack,
      deviceLibrary,
      1,
      toInternalUnits(5),
    );
    // eslint-disable-next-line no-restricted-syntax -- Testing collision count (exactly 1: the container)
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.container_id).toBeUndefined(); // It's the container, not a child
  });

  it("findValidDropPositions excludes container space but ignores children", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    const validPositions = findValidDropPositions(rack, deviceLibrary, 1);

    // Container occupies 5-8, so those positions should be excluded (in internal units)
    expect(validPositions).not.toContain(toInternalUnits(5));
    expect(validPositions).not.toContain(toInternalUnits(6));
    expect(validPositions).not.toContain(toInternalUnits(7));
    expect(validPositions).not.toContain(toInternalUnits(8));

    // Positions 1-4 and 9-42 should be valid (for 1U device, in internal units)
    expect(validPositions).toContain(toInternalUnits(1));
    expect(validPositions).toContain(toInternalUnits(4));
    expect(validPositions).toContain(toInternalUnits(9));
  });
});

// =============================================================================
// canPlaceInContainer Function
// =============================================================================

describe("canPlaceInContainer", () => {
  it("allows placing device in empty container slot", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });
    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(true);
  });

  it("allows moving a child device to same position (excludeDeviceId)", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      id: "child-to-move",
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Without excludeDeviceId, placement at same position should be blocked
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(false);

    // With excludeDeviceId, moving the same device to its current position should succeed
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
        "child-to-move", // Exclude the device being moved
      ),
    ).toBe(true);
  });

  it("blocks placement when slot is occupied by another child", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Same slot and position should be blocked
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(false);
  });

  it("allows placement in different slot at same position", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // slot-right at same position 0 should be allowed (different slot = no collision)
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-right",
        0,
      ),
    ).toBe(true);
  });

  it("blocks placement when position exceeds container height", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4, // Container is 4U tall
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // Position 4 would put 1U device at relative position 4, which is at U 5+4=9
    // Container only spans U 5-8, so position 4 is out of bounds
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        4, // position 4 is out of bounds for 4U container with 1U device
      ),
    ).toBe(false);
  });

  it("allows maximum valid position within container height", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // Position 3 is valid for 1U device in 4U container (positions 0-3)
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        3,
      ),
    ).toBe(true);
  });

  it("blocks multi-U child device that would exceed container height", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server-2u",
      u_height: 2,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // 2U device at position 3 would need positions 3-4, but container only has 0-3
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        3,
      ),
    ).toBe(false);
  });
});

// =============================================================================
// Children Collide Only with Siblings in Same Container
// =============================================================================

describe("Children collide only with siblings in same container", () => {
  it("children in different containers never collide", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container1 = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const container2 = createTestDevice({
      id: "container-2",
      device_type: "blade-chassis",
      position: 15,
    });
    const child1 = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({
      devices: [container1, container2, child1],
    });

    // Placing a child in container-2 should work regardless of child1 in container-1
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container2,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(true);
  });

  it("children in same container and slot collide at overlapping positions", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 2,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0, // 2U at 0-1
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Position 1 would overlap with existing child at 0-1
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        1,
      ),
    ).toBe(false);
  });
});

// =============================================================================
// Face Inheritance
// =============================================================================

describe("Face inheritance for container children", () => {
  it("placement succeeds when container is on rear face", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    // Container on rear face
    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
      face: "rear",
    });
    const rack = createTestRack({ devices: [container] });

    // Placing in container should succeed - child inherits rear face
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Container collision edge cases", () => {
  it("empty container does not affect child placement", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // All positions 0-3 should be valid in empty container
    for (let pos = 0; pos < 4; pos++) {
      expect(
        canPlaceInContainer(
          rack,
          [containerType, childType],
          container,
          containerType,
          childType,
          "slot-left",
          pos,
        ),
      ).toBe(true);
    }
  });

  it("multiple children in same container, different slots", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const child1 = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const child2 = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-right",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, child1, child2] });

    // Position 0 in slot-left is occupied
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(false);

    // Position 0 in slot-right is also occupied
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-right",
        0,
      ),
    ).toBe(false);

    // Position 1 in slot-left should be free
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        1,
      ),
    ).toBe(true);
  });
});
