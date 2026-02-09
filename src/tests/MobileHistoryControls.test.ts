import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import MobileHistoryControls from "$lib/components/mobile/MobileHistoryControls.svelte";
import { getHistoryStore, resetHistoryStore } from "$lib/stores/history.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import * as haptics from "$lib/utils/haptics";
import { createMockCommand } from "./factories";

let originalMatchMedia: typeof window.matchMedia | undefined;

function mockMobileViewport(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(
      (query: string): MediaQueryList =>
        ({
          matches,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    ),
  });
}

describe("MobileHistoryControls", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      originalMatchMedia = window.matchMedia;
    }
    mockMobileViewport(true);
    resetLayoutStore();
    resetHistoryStore();
    resetViewportStore();
  });

  afterEach(() => {
    if (typeof window !== "undefined" && originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
    vi.restoreAllMocks();
    resetLayoutStore();
    resetHistoryStore();
    resetViewportStore();
  });

  it("hides controls when history is empty", () => {
    render(MobileHistoryControls);

    expect(
      screen.queryByRole("group", { name: /history actions/i }),
    ).not.toBeInTheDocument();
  });

  it("button disabled states react to store changes", async () => {
    const history = getHistoryStore();
    history.execute(createMockCommand("Add test device"));

    const layoutStore = getLayoutStore();

    render(MobileHistoryControls);

    const undoButton = screen.getByRole("button", { name: "Undo" });
    const redoButton = screen.getByRole("button", { name: "Redo" });

    expect(undoButton).not.toBeDisabled();
    expect(redoButton).toBeDisabled();

    layoutStore.undo();

    await waitFor(() => {
      expect(undoButton).toBeDisabled();
      expect(redoButton).not.toBeDisabled();
    });
  });

  it("applies undo and redo on tap with haptic feedback", async () => {
    const history = getHistoryStore();
    history.execute(createMockCommand("Add rack"));

    const hapticSpy = vi.spyOn(haptics, "hapticTap").mockImplementation(() => {
      // No-op for test environment.
    });

    render(MobileHistoryControls);

    const undoButton = screen.getByRole("button", { name: "Undo" });
    const redoButton = screen.getByRole("button", { name: "Redo" });

    await fireEvent.click(undoButton);

    await waitFor(() => expect(undoButton).toBeDisabled());
    expect(redoButton).not.toBeDisabled();
    expect(hapticSpy).toHaveBeenCalledTimes(1);

    await fireEvent.click(redoButton);

    await waitFor(() => expect(undoButton).not.toBeDisabled());
    expect(redoButton).toBeDisabled();
    expect(hapticSpy).toHaveBeenCalledTimes(2);
  });
});
