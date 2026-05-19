import { describe, it, expect } from "vitest";
import { serializeLayoutToYaml, parseLayoutYaml } from "$lib/utils/yaml";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

/**
 * Strip slot_position and slot_width lines from a YAML string to simulate
 * layouts saved by the broken serializer introduced in dd25f4c (#1324) and
 * fixed in #1564. The serializer dropped both fields for half-width pairs.
 */
function stripHalfWidthFields(yaml: string): string {
  return yaml
    .split("\n")
    .filter(
      (line) => !line.includes("slot_position") && !line.includes("slot_width"),
    )
    .join("\n");
}

/**
 * Regression tests for layouts saved without slot_position/slot_width (#1602).
 * Two half-width devices at the same position with no slot_position would
 * crash on load with each_key_duplicate. The schema transform must recover
 * by assigning "left"/"right" automatically.
 */
describe("slot_position recovery on load", () => {
  it("assigns left/right to two half-width devices at the same position when slot_position is missing", async () => {
    const halfWidth = createTestDeviceType({
      slug: "half-width-device",
      u_height: 1,
      slot_width: 1,
    });

    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: "device-a",
              device_type: halfWidth.slug,
              position: 10,
              slot_position: "left",
            }),
            createTestDevice({
              id: "device-b",
              device_type: halfWidth.slug,
              position: 10,
              slot_position: "right",
            }),
          ],
        }),
      ],
      device_types: [halfWidth],
    });

    // Strip slot_position and slot_width to simulate the broken serializer
    const yaml = await serializeLayoutToYaml(layout);
    const brokenYaml = stripHalfWidthFields(yaml);

    const restored = await parseLayoutYaml(brokenYaml);
    const devices = restored.racks[0]?.devices ?? [];

    // eslint-disable-next-line no-restricted-syntax -- Behavioral invariant: recovery must preserve device count (2 in -> 2 out)
    expect(devices).toHaveLength(2);

    const slots = devices.map((d) => d.slot_position);
    // Both devices must have a slot_position assigned
    expect(slots).not.toContain(undefined);
    // One must be "left" and one must be "right"
    expect(slots).toContain("left");
    expect(slots).toContain("right");

    // slot_width must also be recovered on the device type so it renders correctly
    expect(restored.device_types[0]?.slot_width).toBe(1);
  });

  it("does not assign slot_position to a single half-width device with no pair", async () => {
    // A single device at a position is ambiguous — recovery only fires for
    // exactly-2 co-located devices, so a solo device must be left untouched.
    const halfWidth = createTestDeviceType({
      slug: "half-width-device",
      u_height: 1,
      slot_width: 1,
    });

    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [
            createTestDevice({
              id: "device-a",
              device_type: halfWidth.slug,
              position: 10,
              slot_position: "left",
            }),
          ],
        }),
      ],
      device_types: [halfWidth],
    });

    // Strip both fields to simulate the broken serializer
    const yaml = await serializeLayoutToYaml(layout);
    const brokenYaml = stripHalfWidthFields(yaml);

    const restored = await parseLayoutYaml(brokenYaml);
    const device = restored.racks[0]?.devices[0];

    // No pair → recovery must not assign a slot_position
    expect(device?.slot_position).toBeUndefined();
  });
});
