import { describe, it, expect } from "vitest";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import {
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
});
