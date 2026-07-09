import { describe, expect, it } from "vitest";
import { getAllBrandDevices, findBrandDevice } from "$lib/data/brandPacks";
import {
  getMountRecommendation,
  getRecommendedMountSlugs,
} from "$lib/utils/mount-recommendations";

describe("RackMate mount recommendations", () => {
  const library = getAllBrandDevices();

  it("recommends a Tiny mount for the Lenovo M720q", () => {
    const tiny = findBrandDevice("lenovo-thinkcentre-m720q-tiny")!;

    expect(getRecommendedMountSlugs(tiny)).toContain(
      "deskpi-rackmate-tiny-1u-mount",
    );
    expect(getMountRecommendation(tiny, 10, library)?.summary).toContain(
      "RackMate 1U Tiny Mount Placeholder",
    );
  });

  it("recommends RackMate utility trays for the UCG-Max", () => {
    const gateway = findBrandDevice("ubiquiti-unifi-cloud-gateway-max")!;

    expect(getRecommendedMountSlugs(gateway)).toContain(
      "deskpi-rackmate-1u-dual-utility-tray",
    );
    expect(getMountRecommendation(gateway, 10, library)?.requirement).toContain(
      "RackMate 1U Dual Utility Tray Placeholder",
    );
  });

  it("does not report bay requirements for rail-native RackMate accessories", () => {
    const patchPanel = findBrandDevice("deskpi-12-port-patch-panel-0-5u")!;

    expect(getMountRecommendation(patchPanel, 10, library)).toBeNull();
  });
});
