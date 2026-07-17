/**
 * Regression tests for #3006 (R27d): clicking on empty canvas, away from any
 * device, rack, or other interactive element, left the current selection
 * intact. Escape already cleared it correctly; a left-click on genuinely
 * empty canvas now mirrors it. handleCanvasClick previously only fired when
 * event.target === event.currentTarget (the #rack-canvas div itself), which
 * essentially never happens: the panzoom container and the racks row fill
 * the canvas, so almost every empty-canvas click landed on one of those
 * wrapper elements instead and was silently ignored.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import Canvas from "./helpers/TestCanvas.svelte";
import { getCanvasStore, resetCanvasStore } from "$lib/stores/canvas.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import {
  getPlacementStore,
  resetPlacementStore,
} from "$lib/stores/placement.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { createMockPanzoom } from "./mocks/panzoom";

/** Place a rack with one device and return their ids. */
function setUpRackWithDevice() {
  const layoutStore = getLayoutStore();
  const rack = layoutStore.addRack("Test Rack", 12);
  const rackId = rack!.id;
  const deviceType = layoutStore.addDeviceType({
    name: "Server",
    u_height: 1,
    category: "server",
    colour: "#4A90D9",
  });
  layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
  const deviceId = layoutStore.getRackById(rackId)!.devices[0]!.id;
  return { rackId, deviceId, deviceType };
}

/** Fire the captured panzoom "panstart" listener to flip canvasStore.isPanning. */
function simulatePanStart(): void {
  const mockPanzoom = createMockPanzoom();
  getCanvasStore().setPanzoomInstance(mockPanzoom);
  const panstart = mockPanzoom.on.mock.calls.find(
    ([event]) => event === "panstart",
  )?.[1];
  panstart?.();
}

describe("Canvas click-to-deselect on empty canvas (#3006)", () => {
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

  it("clears a selected device when clicking empty canvas outside any rack", async () => {
    const { rackId, deviceId } = setUpRackWithDevice();
    const selectionStore = getSelectionStore();
    selectionStore.selectDevice(rackId, deviceId, "front");

    const { getByRole } = render(Canvas);
    const racksRow = getByRole("list", { name: "Racks" });

    await fireEvent.click(racksRow);

    expect(selectionStore.selectedType).toBeNull();
    expect(selectionStore.selectedDeviceId).toBeNull();
  });

  it("clears a selected rack when clicking empty canvas outside any rack", async () => {
    const { rackId } = setUpRackWithDevice();
    const selectionStore = getSelectionStore();
    selectionStore.selectRack(rackId);

    const { getByRole } = render(Canvas);
    const racksRow = getByRole("list", { name: "Racks" });

    await fireEvent.click(racksRow);

    expect(selectionStore.selectedType).toBeNull();
    expect(selectionStore.selectedRackId).toBeNull();
  });

  it("still selects the rack when clicking directly on it (no regression)", async () => {
    const { rackId } = setUpRackWithDevice();
    const selectionStore = getSelectionStore();

    const { getByRole } = render(Canvas);
    const rackListItem = getByRole("listitem", { name: /Test Rack/ });

    await fireEvent.click(rackListItem);

    expect(selectionStore.selectedType).toBe("rack");
    expect(selectionStore.selectedRackId).toBe(rackId);
  });

  it("does not clear the selection while a device is armed for placement", async () => {
    const { rackId, deviceType } = setUpRackWithDevice();
    const selectionStore = getSelectionStore();
    selectionStore.selectRack(rackId);
    getPlacementStore().startPlacement(deviceType);

    const { getByRole } = render(Canvas);
    const racksRow = getByRole("list", { name: "Racks" });

    await fireEvent.click(racksRow);

    expect(selectionStore.selectedType).toBe("rack");
    expect(selectionStore.selectedRackId).toBe(rackId);
  });

  it("does not clear the selection on a click ending a pan/drag gesture", async () => {
    const { rackId } = setUpRackWithDevice();
    const selectionStore = getSelectionStore();
    selectionStore.selectRack(rackId);

    const { getByRole } = render(Canvas);
    simulatePanStart();
    const racksRow = getByRole("list", { name: "Racks" });

    await fireEvent.click(racksRow);

    expect(selectionStore.selectedType).toBe("rack");
    expect(selectionStore.selectedRackId).toBe(rackId);
  });
});
