import { describe, it, expect, beforeEach } from "vitest";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { createTestDeviceType } from "./factories";

describe("updateDeviceFace keeps full-depth devices on both faces", () => {
  beforeEach(() => resetLayoutStore());

  it("coerces a full-depth device's face back to 'both'", () => {
    const store = getLayoutStore();
    const rack = store.addRack("R", 42);
    const dt = createTestDeviceType({ slug: "srv", u_height: 1 }); // full-depth
    store.addDeviceTypeRaw(dt);
    store.placeDevice(rack!.id, dt.slug, 5);

    store.updateDeviceFace(rack!.id, 0, "front");

    expect(store.rack!.devices[0]!.face).toBe("both");
  });

  it("lets a half-depth device move to the rear", () => {
    const store = getLayoutStore();
    const rack = store.addRack("R", 42);
    const dt = createTestDeviceType({
      slug: "shallow",
      u_height: 1,
      is_full_depth: false,
    });
    store.addDeviceTypeRaw(dt);
    store.placeDevice(rack!.id, dt.slug, 5);

    store.updateDeviceFace(rack!.id, 0, "rear");

    expect(store.rack!.devices[0]!.face).toBe("rear");
  });
});
