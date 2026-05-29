import { describe, it, expect } from "vitest";

import { resolveSelectedDevice } from "$lib/utils/device-selection";
import { createTestRack, createTestDevice } from "./factories";

/**
 * Regression tests for #1680: a half-width device on the right side is
 * unselectable when paired with a same-type device at the same U.
 *
 * Root cause: the selection event identified a device by (device_type, position)
 * only. Two half-width devices sharing a U have an identical pair, so the
 * resolver's `.find()` always returned the first (left) device, making the
 * right device structurally unselectable.
 */
describe("resolveSelectedDevice (#1680)", () => {
  it("resolves the clicked device when two half-width devices share device type and position", () => {
    const left = createTestDevice({
      id: "uuid-left",
      device_type: "rackmate-2u",
      position: 54,
      slot_position: "left",
    });
    const right = createTestDevice({
      id: "uuid-right",
      device_type: "rackmate-2u",
      position: 54,
      slot_position: "right",
    });
    const rack = createTestRack({ devices: [left, right] });

    // Clicking the RIGHT device must resolve to the right device, not the
    // first (left) device that happens to share the same (slug, position).
    const resolved = resolveSelectedDevice(rack, {
      deviceId: "uuid-right",
      slug: "rackmate-2u",
      position: 54,
    });

    expect(resolved?.id).toBe("uuid-right");
  });

  it("falls back to (slug, position) when no deviceId is supplied", () => {
    const device = createTestDevice({
      id: "uuid-1",
      device_type: "server",
      position: 12,
    });
    const rack = createTestRack({ devices: [device] });

    const resolved = resolveSelectedDevice(rack, {
      slug: device.device_type,
      position: device.position,
    });

    expect(resolved?.id).toBe("uuid-1");
  });

  it("returns undefined when the deviceId is not present in the rack", () => {
    const device = createTestDevice({ id: "uuid-1", device_type: "server" });
    const rack = createTestRack({ devices: [device] });

    const resolved = resolveSelectedDevice(rack, {
      deviceId: "missing",
      slug: "nonexistent",
      position: 999,
    });

    expect(resolved).toBeUndefined();
  });
});
