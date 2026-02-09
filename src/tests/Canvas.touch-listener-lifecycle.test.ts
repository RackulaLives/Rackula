import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import Canvas from "$lib/components/Canvas.svelte";
import {
  getCanvasStore,
  resetCanvasStore,
} from "$lib/stores/canvas.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { createMockPanzoom } from "./mocks/panzoom";

describe("Canvas touch listener lifecycle", () => {
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

  it("attaches and detaches touch listeners across remount without duplicates", () => {
    const touchEventTypes = ["touchcancel", "touchend", "touchmove", "touchstart"];
    const originalAdd = HTMLElement.prototype.addEventListener;
    const originalRemove = HTMLElement.prototype.removeEventListener;
    const touchAdds: Array<{ target: EventTarget; type: string }> = [];
    const touchRemoves: Array<{ target: EventTarget; type: string }> = [];

    vi.spyOn(HTMLElement.prototype, "addEventListener").mockImplementation(
      function (
        this: HTMLElement,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (touchEventTypes.includes(type)) {
          touchAdds.push({ target: this, type });
        }
        return originalAdd.call(this, type, listener, options);
      },
    );

    vi.spyOn(HTMLElement.prototype, "removeEventListener").mockImplementation(
      function (
        this: HTMLElement,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) {
        if (touchEventTypes.includes(type)) {
          touchRemoves.push({ target: this, type });
        }
        return originalRemove.call(this, type, listener, options);
      },
    );

    const firstRender = render(Canvas);
    const firstCanvas = firstRender.getByRole("application");

    const firstAdds = touchAdds
      .filter((entry) => entry.target === firstCanvas)
      .map((entry) => entry.type)
      .sort();
    expect(firstAdds).toEqual(touchEventTypes);

    firstRender.unmount();

    const firstRemoves = touchRemoves
      .filter((entry) => entry.target === firstCanvas)
      .map((entry) => entry.type)
      .sort();
    expect(firstRemoves).toEqual(touchEventTypes);

    const secondRender = render(Canvas);
    const secondCanvas = secondRender.getByRole("application");
    expect(secondCanvas).not.toBe(firstCanvas);

    const secondAdds = touchAdds
      .filter((entry) => entry.target === secondCanvas)
      .map((entry) => entry.type)
      .sort();
    expect(secondAdds).toEqual(touchEventTypes);

    secondRender.unmount();
  });

  it("clears canvas element from store on detach", () => {
    const store = getCanvasStore();
    const mockPanzoom = createMockPanzoom(1);
    const view = render(Canvas);

    const canvasElement = view.getByRole("application");

    Object.defineProperty(canvasElement, "clientWidth", { value: 800 });
    Object.defineProperty(canvasElement, "clientHeight", { value: 600 });

    store.setPanzoomInstance(
      mockPanzoom as ReturnType<typeof import("panzoom").default>,
    );

    const mockRacks = [
      {
        name: "Test Rack",
        height: 42,
        width: 19 as const,
        position: 0,
        desc_units: false,
        form_factor: "4-post" as const,
        starting_unit: 1,
        devices: [],
      },
    ] as Parameters<typeof store.fitAll>[0];

    store.fitAll(mockRacks);
    expect(mockPanzoom.zoomAbs).toHaveBeenCalledTimes(1);
    expect(mockPanzoom.moveTo).toHaveBeenCalledTimes(1);

    view.unmount();

    store.fitAll(mockRacks);
    expect(mockPanzoom.zoomAbs).toHaveBeenCalledTimes(1);
    expect(mockPanzoom.moveTo).toHaveBeenCalledTimes(1);
  });
});
