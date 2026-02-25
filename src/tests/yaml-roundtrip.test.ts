import { describe, it, expect } from "vitest";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("YAML layout round-trip", () => {
  it("preserves half-width slot width and slot position", async () => {
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
          ],
        }),
      ],
      device_types: [halfWidth],
    });

    const yaml = await serializeLayoutToYaml(layout);
    const restored = await parseLayoutYaml(yaml);

    expect(restored.device_types[0]?.slot_width).toBe(1);
    expect(restored.racks[0]?.devices[0]?.slot_position).toBe("left");
  });
});
