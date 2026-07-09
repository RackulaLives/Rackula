import { describe, it, expect } from "vitest";
import { findBrandDevice } from "$lib/data/brandPacks";
import {
  canPlaceInSlot,
  requiresCarrier,
  requiresChassisBay,
} from "$lib/utils/collision";

describe("RackMate accessory placement", () => {
  it("lets native 0.5U RackMate accessories rail-mount on the 10-inch RackMate", () => {
    const accessories = [
      findBrandDevice("deskpi-12-port-patch-panel-0-5u"),
      findBrandDevice("deskpi-brush-panel-0-5u"),
      findBrandDevice("deskpi-vented-shelf-0-5u"),
    ];

    for (const accessory of accessories) {
      expect(accessory).toBeDefined();
      expect(requiresCarrier(accessory!, 10)).toBe(false);
      expect(requiresChassisBay(accessory!, 10)).toBe(false);
    }
  });

  it("still treats desktop Ubiquiti compact gateways as tray children", () => {
    const gateway = findBrandDevice("ubiquiti-unifi-cloud-gateway-max")!;
    const tray = findBrandDevice("deskpi-rackmate-1u-utility-tray")!;

    expect(gateway.subdevice_role).toBe("child");
    expect(gateway.u_height).toBe(0.5);
    expect(requiresChassisBay(gateway, 10)).toBe(true);
    expect(canPlaceInSlot(gateway, tray.slots![0])).toBe(true);
  });
});
