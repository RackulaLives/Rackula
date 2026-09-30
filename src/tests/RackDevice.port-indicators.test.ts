/**
 * Regression test for #3009: no stock starter-library device declared network
 * interfaces, so the port-indicator feature never rendered visible ports with
 * default content (only NetBox import populated `interfaces`). This asserts a
 * device with an `interfaces` array renders port indicators.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import type { DeviceType } from "$lib/types";
import { HIGH_DENSITY_THRESHOLD } from "$lib/utils/port-geometry";
import { createTestDeviceType } from "./factories";

describe("RackDevice port indicators (#3009)", () => {
  it("renders a port indicator for each declared interface", () => {
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "test-switch", u_height: 1 }),
      interfaces: [
        { name: "1", type: "1000base-t" },
        { name: "2", type: "1000base-t" },
      ],
    };

    const { getByRole } = render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        nominalRackWidth: 19,
      },
    });

    expect(getByRole("button", { name: "1 (1000base-t)" })).toBeInTheDocument();
    expect(getByRole("button", { name: "2 (1000base-t)" })).toBeInTheDocument();
  });
});

describe("RackDevice port indicators with unknown interface types (#3289)", () => {
  const props = {
    position: 6,
    rackHeight: 42,
    rackId: "rack-1",
    deviceIndex: 0,
    selected: false,
    uHeight: 30,
    rackWidth: 300,
    nominalRackWidth: 19,
  };

  it("groups a high-density device whose type is named after an Object prototype member", () => {
    const portCount = HIGH_DENSITY_THRESHOLD + 1;
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "odd-switch", u_height: 1 }),
      interfaces: Array.from({ length: portCount }, (_, i) => ({
        name: String(i + 1),
        type: "constructor",
      })),
    };

    const { getByText } = render(RackDevice, { props: { ...props, device } });

    // One badge counts every port of the shared type.
    expect(getByText(String(portCount))).toBeInTheDocument();
  });
});
