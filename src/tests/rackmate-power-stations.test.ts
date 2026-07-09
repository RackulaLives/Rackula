import { describe, it, expect } from "vitest";
import { findBrandDevice, getBrandDevices } from "$lib/data/brandPacks";
import { DeviceTypeSchema } from "$lib/schemas";
import { canPlaceInSlot, requiresChassisBay } from "$lib/utils/collision";

describe("RackMate portable power station planning data", () => {
  it("exposes PECRON and EcoFlow power stations as bay-only child devices", () => {
    const devices = [
      findBrandDevice("pecron-e300lfp"),
      findBrandDevice("ecoflow-river-3"),
      findBrandDevice("ecoflow-river-3-plus"),
    ];

    for (const device of devices) {
      expect(device).toBeDefined();
      expect(() => DeviceTypeSchema.parse(device)).not.toThrow();
      expect(device?.category).toBe("power");
      expect(device?.subdevice_role).toBe("child");
      expect(requiresChassisBay(device!, 10)).toBe(true);
    }
  });

  it("registers dedicated PECRON and EcoFlow brand packs", () => {
    expect(getBrandDevices("pecron").map((d) => d.slug)).toEqual([
      "pecron-e300lfp",
    ]);
    expect(getBrandDevices("ecoflow").map((d) => d.slug)).toEqual([
      "ecoflow-river-3",
      "ecoflow-river-3-plus",
    ]);
  });

  it("models the RackMate tray bay sizes that determine fit", () => {
    const tray3u = findBrandDevice("deskpi-rackmate-3u-power-station-tray")!;
    const tray4u = findBrandDevice("deskpi-rackmate-4u-power-station-tray")!;
    const pecron = findBrandDevice("pecron-e300lfp")!;
    const river3 = findBrandDevice("ecoflow-river-3")!;
    const river3Plus = findBrandDevice("ecoflow-river-3-plus")!;

    expect(tray3u?.slots?.[0]?.accepts).toEqual(["power"]);
    expect(tray4u?.slots?.[0]?.accepts).toEqual(["power"]);

    expect(canPlaceInSlot(river3, tray3u.slots![0])).toBe(true);
    expect(canPlaceInSlot(pecron, tray3u.slots![0])).toBe(false);
    expect(canPlaceInSlot(pecron, tray4u.slots![0])).toBe(true);
    expect(canPlaceInSlot(river3Plus, tray4u.slots![0])).toBe(true);
  });

  it("keeps RackMate depth clearance warnings machine-readable", () => {
    const pecron = findBrandDevice("pecron-e300lfp")!;
    const fit = pecron.custom_fields?.rackula_fit as {
      rackmate_t1_plus_depth_mm?: number;
      rackmate_t1_plus_depth_clearance_mm?: number;
      recommended_tray_u?: number;
    };

    expect(fit.rackmate_t1_plus_depth_mm).toBe(260);
    expect(fit.rackmate_t1_plus_depth_clearance_mm).toBe(6);
    expect(fit.recommended_tray_u).toBe(4);
  });
});
