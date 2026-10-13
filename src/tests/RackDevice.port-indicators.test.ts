/**
 * Regression test for #3009: no stock starter-library device declared network
 * interfaces, so the port-indicator feature never rendered visible ports with
 * default content (only NetBox import populated `interfaces`). This asserts a
 * device with an `interfaces` array renders port indicators.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import RackDevice from "$lib/components/RackDevice.svelte";
import type { DeviceType } from "$lib/types";
import { HIGH_DENSITY_THRESHOLD } from "$lib/utils/port-geometry";
import { createTestDeviceType, createTestPlacedPort } from "./factories";

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

    expect(
      getByRole("button", { name: "1 (1000base-t), unavailable" }),
    ).toBeInTheDocument();
    expect(
      getByRole("button", { name: "2 (1000base-t), unavailable" }),
    ).toBeInTheDocument();
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

  it("counts a high-density device whose type is named after an Object prototype member", () => {
    const portCount = HIGH_DENSITY_THRESHOLD + 1;
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "odd-switch", u_height: 1 }),
      interfaces: Array.from({ length: portCount }, (_, i) => ({
        name: String(i + 1),
        type: "constructor",
      })),
    };

    const { getByText } = render(RackDevice, { props: { ...props, device } });

    // One chip counts every visible port.
    expect(getByText(String(portCount))).toBeInTheDocument();
  });
});

describe("RackDevice port count chip (#3453)", () => {
  it("shows the count on one chip target when a 10-inch rack collapses the strip", () => {
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "mini-switch", u_height: 1 }),
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
        { name: "sfp0", type: "10gbase-x-sfpp" },
      ],
    };

    const { getByText, getByRole } = render(RackDevice, {
      props: {
        device,
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 22,
        rackWidth: 116,
        nominalRackWidth: 10,
      },
    });

    expect(getByText(String(device.interfaces?.length))).toBeInTheDocument();
    expect(getByRole("button", { name: /\(3 ports\)/ })).toBeInTheDocument();
  });

  it("shows no count when the ports fit as a strip", () => {
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "test-switch", u_height: 1 }),
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
        { name: "sfp0", type: "10gbase-x-sfpp" },
      ],
    };

    const { queryByText } = render(RackDevice, {
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

    expect(queryByText(String(device.interfaces?.length))).toBeNull();
  });
});

describe("RackDevice strip-mode port with no PlacedPort (#3505)", () => {
  it("offers no enabled control for the interface, while a placed port stays clickable", async () => {
    const user = userEvent.setup();
    const onPortClick = vi.fn();
    const onselect = vi.fn();
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "test-switch", u_height: 1 }),
      interfaces: [
        { name: "legacy", type: "1000base-t" },
        { name: "placed", type: "1000base-t" },
      ],
    };

    const { getByRole } = render(RackDevice, {
      props: {
        device,
        ports: [createTestPlacedPort({ id: "port-placed", template_index: 1 })],
        position: 6,
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        nominalRackWidth: 19,
        onPortClick,
        onselect,
      },
    });

    const legacy = getByRole("button", {
      name: "legacy (1000base-t), unavailable",
    });
    expect(legacy).toHaveAttribute("aria-disabled", "true");
    expect(legacy).toHaveAttribute("tabindex", "-1");
    await user.click(legacy);
    expect(onPortClick).not.toHaveBeenCalled();

    onselect.mockClear();
    legacy.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onPortClick).not.toHaveBeenCalled();
    expect(onselect).not.toHaveBeenCalled();

    const placed = getByRole("button", { name: "placed (1000base-t)" });
    await user.click(placed);
    expect(onPortClick).toHaveBeenCalledWith(
      expect.objectContaining({ portId: "port-placed" }),
    );
    expect(onselect).not.toHaveBeenCalled();

    onPortClick.mockClear();
    placed.focus();
    await user.keyboard("{Enter}");
    expect(onPortClick).toHaveBeenCalledTimes(1);
    expect(onselect).not.toHaveBeenCalled();
  });
});
