/**
 * Regression test for the 2026-07-03 audit finding: Enter/Space keydown
 * bubbling up from canvas children (racks, devices, verb bar) must not clear
 * the selection. Only a keydown on the canvas surface itself clears it,
 * mirroring the guard handleCanvasClick already has.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import Canvas from "$lib/components/Canvas.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

describe("Canvas keyboard selection clearing", () => {
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

  it("keeps the selection when Enter bubbles up from a canvas child", async () => {
    const selectionStore = getSelectionStore();
    const { getByTestId } = render(Canvas);
    selectionStore.selectRack("rack-1");

    await fireEvent.keyDown(getByTestId("add-rack-affordance"), {
      key: "Enter",
    });

    expect(selectionStore.selectedRackId).toBe("rack-1");
  });

  it("clears the selection when Enter targets the canvas surface itself", async () => {
    const selectionStore = getSelectionStore();
    const { getByTestId } = render(Canvas);
    selectionStore.selectRack("rack-1");

    await fireEvent.keyDown(getByTestId("rack-canvas"), { key: "Enter" });

    expect(selectionStore.selectedRackId).toBeNull();
  });
});
