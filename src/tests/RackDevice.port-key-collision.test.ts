/**
 * Regression test for PR #3112 review findings (CodeAnt, CodeRabbit): the
 * keyed #each in PortIndicators.svelte fell back to `iface.name` when a port
 * has no matching PlacedPort. Duplicate interface names are explicitly legal
 * (template_index exists specifically to disambiguate them, see
 * port-geometry.ts), and a legacy layout saved before PlacedPort existed has
 * every port undefined (PlacedDevice.ports defaults to [] via the schema).
 * Combined, those two facts made the fallback key collide, and Svelte's
 * keyed #each silently drops/reuses DOM nodes for colliding keys.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
import type { DeviceType } from "$lib/types";
import { createTestDeviceType } from "./factories";

describe("PortIndicators keyed #each (duplicate names, no PlacedPort)", () => {
  it("renders one hit target per interface even when names collide and no ports are instantiated", () => {
    const device: DeviceType = {
      ...createTestDeviceType({ slug: "test-switch", u_height: 1 }),
      interfaces: [
        { name: "SFP+", type: "10gbase-x-sfpp" },
        { name: "SFP+", type: "25gbase-x-sfp28" },
      ],
    };

    // No `ports` prop passed: mirrors a layout placed before PlacedPort
    // existed, so both interfaces resolve with port undefined.
    const { getAllByRole } = render(RackDevice, {
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

    // Every interface must get its own hit target, distinguishable by its
    // accessible name (type-suffixed even though both share the "SFP+"
    // name): a colliding key would drop or misattribute one.
    const portTargets = getAllByRole("button", { name: /^SFP\+/ });
    expect(portTargets.length).toBe(device.interfaces?.length);
    expect(
      getAllByRole("button", { name: "SFP+ (10gbase-x-sfpp)" }).length,
    ).toBe(1);
    expect(
      getAllByRole("button", { name: "SFP+ (25gbase-x-sfp28)" }).length,
    ).toBe(1);
  });
});
