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
});
