import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import ToolbarTestWrapper from "./helpers/ToolbarTestWrapper.svelte";

function mockMobileViewport(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("Toolbar mobile quick actions", () => {
  beforeEach(() => {
    mockMobileViewport(true);
    resetViewportStore();
  });

  it("triggers quick action callbacks", async () => {
    const onsave = vi.fn();
    const onload = vi.fn();
    const onexport = vi.fn();

    render(ToolbarTestWrapper, { hasRacks: true, onsave, onload, onexport });

    await fireEvent.click(screen.getByRole("button", { name: /save layout/i }));
    await fireEvent.click(screen.getByRole("button", { name: /load layout/i }));
    await fireEvent.click(
      screen.getByRole("button", { name: /export layout/i }),
    );

    expect(onsave).toHaveBeenCalledTimes(1);
    expect(onload).toHaveBeenCalledTimes(1);
    expect(onexport).toHaveBeenCalledTimes(1);
  });

  it("disables export when there are no racks", () => {
    render(ToolbarTestWrapper, { hasRacks: false });

    expect(screen.getByRole("button", { name: /export layout/i })).toBeDisabled();
  });
});
