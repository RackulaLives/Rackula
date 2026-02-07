import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import BottomSheet from "$lib/components/BottomSheet.svelte";

describe("BottomSheet", () => {
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
  });

  function renderSheet() {
    return render(BottomSheet, {
      props: {
        open: true,
        title: "Test Sheet",
        onclose: onClose,
      },
    });
  }

  function ensurePointerCaptureApi(element: HTMLElement) {
    Object.defineProperty(element, "setPointerCapture", {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(element, "releasePointerCapture", {
      value: vi.fn(),
      configurable: true,
    });
  }

  it("calls onclose when clicking the backdrop", async () => {
    renderSheet();

    await fireEvent.click(screen.getByRole("presentation"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onclose when pressing Escape", async () => {
    renderSheet();

    await fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onclose when swiping down past threshold", () => {
    renderSheet();

    const dialog = screen.getByRole("dialog");
    ensurePointerCaptureApi(dialog);

    dialog.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 100,
        pointerId: 1,
      }),
    );
    dialog.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        clientY: 240,
        pointerId: 1,
      }),
    );
    dialog.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "touch",
        clientY: 240,
        pointerId: 1,
      }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onclose when swipe is below threshold", () => {
    renderSheet();

    const dialog = screen.getByRole("dialog");
    ensurePointerCaptureApi(dialog);

    // 100 -> 150 is only a 50px swipe, below the closing threshold.
    dialog.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientY: 100,
        pointerId: 1,
      }),
    );
    dialog.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "touch",
        clientY: 150,
        pointerId: 1,
      }),
    );

    expect(onClose).not.toHaveBeenCalled();
  });
});
