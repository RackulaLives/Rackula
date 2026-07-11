/**
 * Regression test for #2935: aborting an in-progress device drag with Escape
 * left a stale drop-target highlight behind. RackDevice's pointercancel/drop
 * paths only clear a Rack's local preview via the "rackula:dragmove" /
 * "rackula:dragend" document events; Escape had no equivalent, so the last
 * computed drop preview (and container hover highlight) stayed rendered
 * after the drag was aborted. attachPointerDragListeners must also listen
 * for a "rackula:dragcancel" event that clears both without dispatching a
 * drop action.
 */
import { describe, it, expect, vi } from "vitest";
import {
  attachPointerDragListeners,
  type PointerDragContext,
} from "$lib/utils/rack-pointer-drag";
import type { Rack } from "$lib/types";

function createContext(
  overrides: Partial<PointerDragContext> = {},
): PointerDragContext {
  return {
    getSvgElement: () => null,
    getRack: () => ({ id: "rack-1" }) as Rack,
    getDeviceLibrary: () => [],
    getRackDims: () => ({
      rackHeight: 0,
      rackWidth: 0,
      interiorWidth: 0,
      uHeight: 0,
      rackPadding: 0,
      railWidth: 0,
    }),
    getFaceFilter: () => undefined,
    getSelectedDeviceId: () => null,
    getEventCallbacks: () => ({}),
    setDropPreview: vi.fn(),
    setContainerHoverInfo: vi.fn(),
    onDragFinished: vi.fn(),
    layoutStore: {} as PointerDragContext["layoutStore"],
    toastStore: {} as PointerDragContext["toastStore"],
    ...overrides,
  };
}

describe("attachPointerDragListeners rackula:dragcancel (#2935)", () => {
  it("clears the drop preview and container hover info without dispatching a drop", () => {
    const setDropPreview = vi.fn();
    const setContainerHoverInfo = vi.fn();
    const onDragFinished = vi.fn();
    const ctx = createContext({
      setDropPreview,
      setContainerHoverInfo,
      onDragFinished,
    });

    const detach = attachPointerDragListeners(ctx);

    document.dispatchEvent(new CustomEvent("rackula:dragcancel"));

    expect(setDropPreview).toHaveBeenCalledWith(null);
    expect(setContainerHoverInfo).toHaveBeenCalledWith(null);
    // A cancelled drag never resolves or dispatches a drop action.
    expect(onDragFinished).not.toHaveBeenCalled();

    detach();
  });

  it("stops listening for rackula:dragcancel after detach", () => {
    const setDropPreview = vi.fn();
    const ctx = createContext({ setDropPreview });

    const detach = attachPointerDragListeners(ctx);
    detach();

    document.dispatchEvent(new CustomEvent("rackula:dragcancel"));

    expect(setDropPreview).not.toHaveBeenCalled();
  });
});
