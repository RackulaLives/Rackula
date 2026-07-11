import { describe, it, expect, beforeEach } from "vitest";
import { validateCable } from "$lib/stores/cables.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { createTestDeviceType } from "./factories";

describe("validateCable", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("resolves endpoints across all racks, not just the active rack", () => {
    const store = getLayoutStore();
    const deviceType = createTestDeviceType({ slug: "generic-server" });
    store.addDeviceTypeRaw(deviceType);

    const rackA = store.addRack("Rack A", 42)!;
    store.placeDevice(rackA.id, deviceType.slug, 5);

    const rackB = store.addRack("Rack B", 42)!;
    store.placeDevice(rackB.id, deviceType.slug, 5);

    // Rack B is the active rack (most recently added).
    expect(store.rack!.id).toBe(rackB.id);

    const deviceInA = store.layout.racks.find((r) => r.id === rackA.id)!
      .devices[0]!;
    const deviceInB = store.layout.racks.find((r) => r.id === rackB.id)!
      .devices[0]!;

    const result = validateCable(
      {
        a_device_id: deviceInA.id,
        a_interface: "eth0",
        b_device_id: deviceInB.id,
        b_interface: "eth1",
      },
      [],
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
