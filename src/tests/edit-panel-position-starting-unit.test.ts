/**
 * Regression test for CodeAnt finding (PR #3018, comment 3566108076):
 * formatDisplayPosition ignored a rack's starting_unit, so on a rack whose
 * numbering starts above U1 (e.g. a continuation rack), the U label shown
 * in the edit panel's Position row diverged from the ruler.
 *
 * EditPanelPosition's display previously showed the same result as if
 * starting_unit were always 1 (a pre-existing gap, not introduced here).
 * That is a genuine behaviour change for offset racks: the panel now
 * matches the ruler, which is the correct outcome, but the displayed text
 * for an offset rack is different from before this fix.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import EditPanelPosition from "$lib/components/EditPanelPosition.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  createTestRack,
  createTestDevice,
  createTestDeviceType,
} from "./factories";
import type { SelectedDeviceInfo } from "$lib/types";

describe("EditPanelPosition starting_unit (offset racks)", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("matches the ruler's label for an ascending rack with an offset starting_unit", () => {
    // starting_unit: 25, ascending. Ruler formula: uNumber = startUnit +
    // (height - 1) - i, i = height - positionHuman. positionHuman 17 in a
    // 42U rack -> i = 25 -> uNumber = 25 + 41 - 25 = 41.
    const rack = createTestRack({ height: 42, starting_unit: 25 });
    const device = createTestDeviceType({ slug: "server", u_height: 1 });
    const placedDevice = createTestDevice({
      device_type: "server",
      position: 17,
    });
    rack.devices = [placedDevice];

    const selectedDeviceInfo: SelectedDeviceInfo = {
      device,
      placedDevice,
      rack,
      deviceIndex: 0,
    };

    render(EditPanelPosition, { props: { selectedDeviceInfo } });

    expect(screen.getByText("U41")).toBeInTheDocument();
    // Would have shown "U17" before this fix (starting_unit ignored).
    expect(screen.queryByText("U17")).not.toBeInTheDocument();
  });

  it("matches the ruler's label for a descending rack with an offset starting_unit", () => {
    // starting_unit: 25, descending. Ruler formula: uNumber = startUnit + i,
    // i = height - positionHuman. positionHuman 17 in a 42U rack -> i = 25
    // -> uNumber = 25 + 25 = 50.
    const rack = createTestRack({
      height: 42,
      starting_unit: 25,
      desc_units: true,
    });
    const device = createTestDeviceType({ slug: "server", u_height: 1 });
    const placedDevice = createTestDevice({
      device_type: "server",
      position: 17,
    });
    rack.devices = [placedDevice];

    const selectedDeviceInfo: SelectedDeviceInfo = {
      device,
      placedDevice,
      rack,
      deviceIndex: 0,
    };

    render(EditPanelPosition, { props: { selectedDeviceInfo } });

    expect(screen.getByText("U50")).toBeInTheDocument();
    // Would have shown "U26" before this fix (starting_unit ignored: the
    // desc_units-only formula height - wholeU + 1 = 42 - 17 + 1 = 26).
    expect(screen.queryByText("U26")).not.toBeInTheDocument();
  });

  it("is unchanged for a rack starting at U1 (default)", () => {
    const rack = createTestRack({ height: 42 });
    const device = createTestDeviceType({ slug: "server", u_height: 1 });
    const placedDevice = createTestDevice({
      device_type: "server",
      position: 17,
    });
    rack.devices = [placedDevice];

    const selectedDeviceInfo: SelectedDeviceInfo = {
      device,
      placedDevice,
      rack,
      deviceIndex: 0,
    };

    render(EditPanelPosition, { props: { selectedDeviceInfo } });

    expect(screen.getByText("U17")).toBeInTheDocument();
  });
});
