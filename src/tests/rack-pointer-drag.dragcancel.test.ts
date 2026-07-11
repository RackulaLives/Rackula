/**
 * Regression test for #2935: aborting an in-progress device drag with Escape
 * left a stale drop-target highlight behind. RackDevice's pointercancel/drop
 * paths only clear a Rack's local preview via the "rackula:dragmove" /
 * "rackula:dragend" document events; Escape had no equivalent, so the last
 * computed drop preview (and container hover highlight) stayed rendered
 * after the drag was aborted. attachPointerDragListeners must also listen
 * for a "rackula:dragcancel" event that clears both.
 *
 * It must also arm the click-suppression debounce (onDragFinished), the same
 * one the dragend path uses: the browser synthesises a trailing click on the
 * pointer release that follows the Escape cancel, and without arming the
 * debounce that click would select the rack or place a pending device
 * (CodeAnt review of PR #2970). onDragFinished arms suppression only; it does
 * not resolve or dispatch a drop.
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
  it("clears the drop preview and container hover info and arms the click debounce", () => {
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
    // Arm the same debounce dragend uses so the browser's trailing synthetic
    // click after the pointer release does not select the rack or place a
    // pending device.
    expect(onDragFinished).toHaveBeenCalledTimes(1);

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
