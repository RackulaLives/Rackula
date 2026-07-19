/**
 * Regression test for #2890: PR #2882 added a container-hierarchy screen
 * reader announcement, but placed it in Rack.svelte's `visibleDevices` each
 * block, which filters out any device with a truthy container_id -- so the
 * branch could never fire. PR #2888 removed the resulting dead code, leaving
 * container child devices with no accessible name at all (they render as raw
 * <rect>/<text> SVG in RackDevice.svelte's container-children block).
 *
 * This test asserts the accessible name directly at the reachable site: the
 * child <g> in RackDevice.svelte's container-children rendering.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import {
  createTestDeviceType,
  createTestContainerType,
  createTestContainerChild,
} from "./factories";

describe("RackDevice container-child accessible name (#2890)", () => {
  it("announces device, height, category, slot, container, and container position", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      model: "Blade Chassis",
      u_height: 4,
      slots: [
        {
          id: "slot-left",
          name: "Left Bay",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
        },
        {
          id: "slot-right",
          name: "Right Bay",
          position: { row: 0, col: 1 },
          width_fraction: 0.5,
        },
      ],
    });

    const childType = createTestDeviceType({
      slug: "blade-server",
      model: "Blade Server",
      u_height: 1,
      category: "server",
    });

    const child = createTestContainerChild({
      id: "child-1",
      device_type: childType.slug,
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
    });

    const { getByRole } = render(RackDevice, {
      props: {
        device: containerType,
        position: 30, // internal units (6/U) -> U5
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        deviceLibrary: [containerType, childType],
        containerChildDevices: [{ placedDevice: child, originalIndex: 0 }],
      },
    });

    const childElement = getByRole("img", {
      name: "Blade Server, 1U server in Left Bay of Blade Chassis at U5",
    });
    expect(childElement).toBeInTheDocument();
  });

  it("falls back to the slot id when the slot has no display name", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      model: "Blade Chassis",
      u_height: 4,
      slots: [
        {
          id: "slot-left",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
        },
      ],
    });

    const childType = createTestDeviceType({
      slug: "blade-server",
      model: "Blade Server",
      u_height: 1,
      category: "server",
    });

    const child = createTestContainerChild({
      id: "child-1",
      device_type: childType.slug,
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
    });

    const { getByRole } = render(RackDevice, {
      props: {
        device: containerType,
        position: 6, // U1
        rackHeight: 42,
        rackId: "rack-1",
        deviceIndex: 0,
        selected: false,
        uHeight: 30,
        rackWidth: 300,
        deviceLibrary: [containerType, childType],
        containerChildDevices: [{ placedDevice: child, originalIndex: 0 }],
      },
    });

    const childElement = getByRole("img", {
      name: "Blade Server, 1U server in slot-left of Blade Chassis at U1",
    });
    expect(childElement).toBeInTheDocument();
  });
});
