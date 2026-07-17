/**
 * Regression test for #2999 (R17b): the rack device aria-label was built from
 * `device.model ?? device.slug`, ignoring the placement's custom name, so a
 * renamed device still announced its device-type name. The aria-label must
 * use the same name precedence as the visible label (placement name, then
 * model, then slug).
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import { createTestDeviceType } from "./factories";

describe("RackDevice aria-label name precedence (#2999)", () => {
  it("announces the placement's custom name, not the device model", () => {
    const device = createTestDeviceType({
      slug: "test-server",
      model: "Dell PowerEdge R740",
      u_height: 1,
    });

    const { getByTestId } = render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        placedDeviceName: "db-primary",
      },
    });

    const ariaLabel = getByTestId("rack-device").getAttribute("aria-label");
    expect(ariaLabel).toContain("db-primary");
    expect(ariaLabel).not.toContain("Dell PowerEdge R740");
  });

  it("falls back to the device model when no placement name is set", () => {
    const device = createTestDeviceType({
      slug: "test-server",
      model: "Dell PowerEdge R740",
      u_height: 1,
    });

    const { getByTestId } = render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
      },
    });

    const ariaLabel = getByTestId("rack-device").getAttribute("aria-label");
    expect(ariaLabel).toContain("Dell PowerEdge R740");
  });
});
