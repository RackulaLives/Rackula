import { describe, it, expect } from "vitest";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import type { DeviceType } from "$lib/types";
import {
  createTestContainerChild,
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("YAML layout round-trip", () => {
  it("preserves slot_width and slot_position for half-width devices", async () => {
    const halfWidth = createTestDeviceType({
      slug: "half-width-device",
      u_height: 1,
      slot_width: 1,
    });

    const layout = createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({
              id: "placed-1",
              device_type: halfWidth.slug,
              position: 10,
              slot_position: "left",
            }),
            createTestDevice({
              id: "placed-2",
              device_type: halfWidth.slug,
              position: 10,
              slot_position: "right",
            }),
          ],
        }),
      ],
      device_types: [halfWidth],
    });

    const yaml = await serializeLayoutToYaml(layout);

    // slot_width must be serialised so the device type round-trips as half-width
    expect(yaml).toContain("slot_width");
    // slot_position must be serialised so left/right placement survives save/load
    expect(yaml).toContain("slot_position");

    const restored = await parseLayoutYaml(yaml);
    expect(restored.device_types[0]?.slot_width).toBe(1);
    expect(restored.racks[0]?.devices[0]?.slot_position).toBe("left");
    expect(restored.racks[0]?.devices[1]?.slot_position).toBe("right");
  });

  it("preserves container_id and slot_id for contained child devices", async () => {
    const containerType: DeviceType = {
      ...createTestDeviceType({
        slug: "container-device",
        u_height: 2,
      }),
      slots: [{ id: "slot-left", position: { row: 0, col: 0 } }],
    };
    const childType = createTestDeviceType({
      slug: "child-device",
      u_height: 1,
    });

    const layout = createTestLayout({
      racks: [
        createTestRack({
          id: "rack-1",
          devices: [
            createTestDevice({
              id: "container-1",
              device_type: containerType.slug,
              position: 10,
            }),
            createTestContainerChild({
              id: "child-1",
              device_type: childType.slug,
              container_id: "container-1",
              slot_id: "slot-left",
            }),
          ],
        }),
      ],
      device_types: [containerType, childType],
    });

    const yaml = await serializeLayoutToYaml(layout);

    // container_id/slot_id must be serialised so container membership survives save/load
    expect(yaml).toContain("container_id");
    expect(yaml).toContain("slot_id");

    const restored = await parseLayoutYaml(yaml);
    const restoredContainerType = restored.device_types.find(
      (dt) => dt.slug === "container-device",
    );
    expect(restoredContainerType?.slots?.[0]?.id).toBe("slot-left");
    const child = restored.racks[0]?.devices.find((d) => d.id === "child-1");
    expect(child?.container_id).toBe("container-1");
    expect(child?.slot_id).toBe("slot-left");
  });
});
