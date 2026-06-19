import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import MobileViewSheet from "$lib/components/mobile/MobileViewSheet.svelte";
import { getCanvasStore, resetCanvasStore } from "$lib/stores/canvas.svelte";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import { createMockPanzoom } from "./mocks/panzoom";
import type { DisplayMode } from "$lib/types";

function renderSheet(
  overrides: Partial<{
    displayMode: DisplayMode;
    showAnnotations: boolean;
    ondisplaymodechange: (mode: DisplayMode) => void;
    onannotationschange: (enabled: boolean) => void;
    onfitall: () => void;
    onresetzoom: () => void;
    onclose: () => void;
  }> = {},
) {
  const props = {
    displayMode: "label" as DisplayMode,
    showAnnotations: false,
    ondisplaymodechange: vi.fn(),
    onannotationschange: vi.fn(),
    onfitall: vi.fn(),
    onresetzoom: vi.fn(),
    onclose: vi.fn(),
    ...overrides,
  };

  render(MobileViewSheet, { props });
  return props;
}

describe("MobileViewSheet", () => {
  beforeEach(() => {
    resetCanvasStore();
    resetUIStore();
  });

  it("reflects current annotation state on open", () => {
    renderSheet({ showAnnotations: true });

    expect(screen.getByRole("switch", { name: "Annotations" })).toBeChecked();
  });

  it("omits the Theme control", () => {
    renderSheet();

    expect(screen.queryByRole("switch", { name: /Theme/ })).toBeNull();
  });

  it("calls ondisplaymodechange when display mode is changed", async () => {
    const props = renderSheet({ displayMode: "label" });

    await fireEvent.click(screen.getByRole("button", { name: "Image" }));

    expect(props.ondisplaymodechange).toHaveBeenCalledWith("image");
  });

  it("applies annotation changes immediately", async () => {
    const props = renderSheet({ showAnnotations: false });

    await fireEvent.click(screen.getByRole("switch", { name: "Annotations" }));

    expect(props.onannotationschange).toHaveBeenCalledWith(true);
  });

  it("reflects the read-only lock state from the UI store", () => {
    getUIStore().setReadOnly(true);

    renderSheet();

    expect(screen.getByRole("switch", { name: "Read-only" })).toBeChecked();
  });

  it("locks and unlocks the layout via the read-only toggle", async () => {
    const uiStore = getUIStore();
    renderSheet();

    const lock = screen.getByRole("switch", { name: "Read-only" });
    expect(uiStore.readOnly).toBe(false);

    await fireEvent.click(lock);
    expect(uiStore.readOnly).toBe(true);

    await fireEvent.click(lock);
    expect(uiStore.readOnly).toBe(false);
  });

  it("runs Fit to screen and closes the sheet", async () => {
    const props = renderSheet();

    await fireEvent.click(
      screen.getByRole("button", { name: "Fit to screen" }),
    );

    expect(props.onfitall).toHaveBeenCalledTimes(1);
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("runs Reset zoom and closes the sheet", async () => {
    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));

    expect(props.onresetzoom).toHaveBeenCalledTimes(1);
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("shows the current zoom percentage from the canvas store", () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(1.5));

    renderSheet();

    expect(screen.getByRole("status")).toHaveTextContent("150%");
  });

  it("steps zoom in via the canvas store stepper", async () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(1));

    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    // 1.0 snaps up one rung on the ladder to 1.25 (125%).
    expect(store.zoomPercentage).toBe(125);
  });

  it("steps zoom out via the canvas store stepper", async () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(1));

    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    // 1.0 snaps down one rung on the ladder to 0.75 (75%).
    expect(store.zoomPercentage).toBe(75);
  });

  it("disables zoom in at the maximum zoom", () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(2));

    renderSheet();

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  });

  it("disables zoom out at the minimum zoom", () => {
    const store = getCanvasStore();
    store.setPanzoomInstance(createMockPanzoom(0.25));

    renderSheet();

    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });
});
