/**
 * Regression test for #2935: an in-progress canvas resize drag reset only on
 * a browser-issued pointercancel, drop, or pointerup. Pressing Escape mid-drag
 * had no handler and could not abort it. This asserts Escape aborts an active
 * resize drag and restores the rack's pre-drag height, mirroring the
 * pointercancel reset path (handleResizeCancel).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import RackCanvasView from "$lib/components/RackCanvasView.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

describe("RackCanvasView Escape-to-cancel resize drag (#2935)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetCanvasStore();
    resetUIStore();
    resetPlacementStore();
    resetToastStore();
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

  it("aborts an active resize drag and restores the rack's pre-drag height", async () => {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack failed to create a rack");
    getSelectionStore().selectRack(rack.id);

    const { getByLabelText } = render(RackCanvasView);

    const grip = getByLabelText("Resize rack height from bottom edge");

    grip.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientY: 0,
      }),
    );
    grip.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientY: 200,
      }),
    );
    await tick();

    // Precondition: the drag actually previewed a new height.
    expect(layoutStore.getRackById(rack.id)?.height).not.toBe(42);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await tick();

    expect(layoutStore.getRackById(rack.id)?.height).toBe(42);
  });

  it("does nothing when Escape is pressed while no resize drag is active", async () => {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack failed to create a rack");
    getSelectionStore().selectRack(rack.id);

    render(RackCanvasView);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await tick();

    expect(layoutStore.getRackById(rack.id)?.height).toBe(42);
  });
});
