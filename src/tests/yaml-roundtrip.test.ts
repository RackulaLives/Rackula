import { describe, it, expect } from "vitest";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("YAML layout round-trip", () => {
  it("omits deprecated slot_width and slot_position from YAML output", async () => {
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

    // Deprecated NetBox fields should not appear in serialised output
    expect(yaml).not.toContain("slot_width");
    expect(yaml).not.toContain("slot_position");

    // Round-trip should still produce a valid layout
    const restored = await parseLayoutYaml(yaml);
    expect(restored.racks.length).toBeGreaterThan(0);
    expect(restored.device_types.length).toBeGreaterThan(0);
  });
});
