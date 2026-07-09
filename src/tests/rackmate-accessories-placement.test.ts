import { describe, it, expect } from "vitest";
import { findBrandDevice } from "$lib/data/brandPacks";
import {
  canPlaceDevice,
  canPlaceInSlot,
  requiresCarrier,
  requiresChassisBay,
} from "$lib/utils/collision";
import { LayoutSchema } from "$lib/schemas";
import { toInternalUnits } from "$lib/utils/position";
import { createTestRack } from "./factories";

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

  it("allows native 0.5U RackMate accessories to use half-U rail positions", () => {
    const accessory = findBrandDevice("deskpi-12-port-patch-panel-0-5u")!;
    const rack = createTestRack({ height: 8, width: 10 });

    expect(
      canPlaceDevice(
        rack,
        [accessory],
        accessory.u_height,
        toInternalUnits(1.5),
        undefined,
        "front",
        undefined,
        accessory,
      ),
    ).toBe(true);
  });

  it("allows native half-U RackMate accessory layouts through schema validation", () => {
    const accessory = findBrandDevice("deskpi-12-port-patch-panel-0-5u")!;

    const result = LayoutSchema.safeParse({
      version: "1.0.0",
      name: "RackMate accessories",
      racks: [
        {
          id: "rack-1",
          name: "RackMate",
          height: 8,
          width: 10,
          desc_units: false,
          show_rear: true,
          form_factor: "4-post-cabinet",
          starting_unit: 1,
          position: 0,
          devices: [
            {
              id: "patch-half",
              device_type: accessory.slug,
              position: toInternalUnits(1.5),
              face: "front",
            },
          ],
        },
      ],
      device_types: [accessory],
      settings: {
        display_mode: "label",
        show_labels_on_images: false,
      },
    });

    expect(result.success).toBe(true);
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
