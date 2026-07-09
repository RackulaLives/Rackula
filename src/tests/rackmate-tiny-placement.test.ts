import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { findBrandDevice } from "$lib/data/brandPacks";
import { parseLayoutYaml } from "$lib/utils/yaml";
import { canPlaceInSlot, requiresChassisBay } from "$lib/utils/collision";

describe("RackMate Lenovo Tiny placement", () => {
  it("treats the ThinkCentre M720q Tiny as a chassis-bay child", () => {
    const tiny = findBrandDevice("lenovo-thinkcentre-m720q-tiny")!;
    const mount = findBrandDevice("deskpi-rackmate-tiny-1u-mount")!;

    expect(tiny.subdevice_role).toBe("child");
    expect(requiresChassisBay(tiny, 10)).toBe(true);
    expect(canPlaceInSlot(tiny, mount.slots![0])).toBe(true);
  });

  it("ships the RackMate starter with every M720q inside a mount bay", async () => {
    const path = join(
      process.cwd(),
      "static",
      "templates",
      "rackmate-t1-plus.rackula.yaml",
    );
    const layout = await parseLayoutYaml(readFileSync(path, "utf8"));
    const tinyType = layout.device_types.find(
      (deviceType) => deviceType.slug === "lenovo-thinkcentre-m720q-tiny",
    );
    const tinyPlacements = layout.racks.flatMap((rack) =>
      rack.devices.filter(
        (device) => device.device_type === "lenovo-thinkcentre-m720q-tiny",
      ),
    );

    expect(tinyType?.subdevice_role).toBe("child");
    expect(tinyPlacements.length).toBe(3);
    expect(
      tinyPlacements.every(
        (device) => device.container_id && device.slot_id === "main",
      ),
    ).toBe(true);
  });
});
