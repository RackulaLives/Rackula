/**
 * Regression test for #2999 (R17a): the screen-reader device-list
 * description formatted the raw internal rail position (displayed U times
 * UNITS_PER_U) instead of the displayed U, so a device rendered at U17 was
 * announced as "U102". The announced position must match the rendered U.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import Canvas from "$lib/components/Canvas.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

describe("Canvas device-list description position (#2999)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    resetPlacementStore();
    resetViewportStore();

    vi.stubGlobal("matchMedia", (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("announces the rendered U-position, not the raw rail position", () => {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    const rackId = rack!.id;

    const deviceType = layoutStore.addDeviceType({
      name: "Server Type",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });

    layoutStore.placeDevice(rackId, deviceType.slug, 17, "front");

    const { getByText } = render(Canvas);

    const description = getByText(/Active rack devices from top to bottom/);
    expect(description.textContent).toContain("U17:");
    expect(description.textContent).not.toContain("U102");
  });

  it("announces the ruler's label for descending-numbered racks (desc_units: true)", () => {
    const layoutStore = getLayoutStore();
    // desc_units: true = "U1 at top". Mirrors Rack.svelte's uLabels flip:
    // uNumber = startUnit + i (row index from top), so a 1U device whose
    // rail position (physical, bottom-up) is U17 in a 42U rack sits at row
    // i = height - positionHuman = 42 - 17 = 25, which the ruler labels
    // "U26" (startUnit 1 + i 25).
    const rack = layoutStore.addRack(
      "Descending Rack",
      42,
      undefined,
      undefined,
      true,
    );
    const rackId = rack!.id;

    const deviceType = layoutStore.addDeviceType({
      name: "Server Type",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });

    layoutStore.placeDevice(rackId, deviceType.slug, 17, "front");

    const { getByText } = render(Canvas);

    const description = getByText(/Active rack devices from top to bottom/);
    expect(description.textContent).toContain("U26:");
    expect(description.textContent).not.toContain("U17:");
  });

  it("announces the ruler's label for an ascending rack with an offset starting_unit", () => {
    const layoutStore = getLayoutStore();
    // starting_unit: 25, ascending (desc_units false). Ruler formula:
    // uNumber = startUnit + (height - 1) - i, i = height - positionHuman.
    // positionHuman 17 in a 42U rack -> i = 25 -> uNumber = 25 + 41 - 25 = 41.
    const rack = layoutStore.addRack(
      "Offset Ascending Rack",
      42,
      undefined,
      undefined,
      false,
      25,
    );
    const rackId = rack!.id;

    const deviceType = layoutStore.addDeviceType({
      name: "Server Type",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });

    layoutStore.placeDevice(rackId, deviceType.slug, 17, "front");

    const { getByText } = render(Canvas);

    const description = getByText(/Active rack devices from top to bottom/);
    expect(description.textContent).toContain("U41:");
  });

  it("announces the ruler's label for a descending rack with an offset starting_unit", () => {
    const layoutStore = getLayoutStore();
    // starting_unit: 25, descending (desc_units true). Ruler formula:
    // uNumber = startUnit + i, i = height - positionHuman.
    // positionHuman 17 in a 42U rack -> i = 25 -> uNumber = 25 + 25 = 50.
    const rack = layoutStore.addRack(
      "Offset Descending Rack",
      42,
      undefined,
      undefined,
      true,
      25,
    );
    const rackId = rack!.id;

    const deviceType = layoutStore.addDeviceType({
      name: "Server Type",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });

    layoutStore.placeDevice(rackId, deviceType.slug, 17, "front");

    const { getByText } = render(Canvas);

    const description = getByText(/Active rack devices from top to bottom/);
    expect(description.textContent).toContain("U50:");
  });
});
