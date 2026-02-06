import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import MobileViewSheet from "$lib/components/mobile/MobileViewSheet.svelte";
import type { DisplayMode } from "$lib/types";

function renderSheet(overrides: Partial<{
  displayMode: DisplayMode;
  showAnnotations: boolean;
  theme: "dark" | "light";
  ondisplaymodechange: (mode: DisplayMode) => void;
  onannotationschange: (enabled: boolean) => void;
  onthemechange: (theme: "dark" | "light") => void;
  onfitall: () => void;
  onresetzoom: () => void;
  onclose: () => void;
}> = {}) {
  const props = {
    displayMode: "label" as DisplayMode,
    showAnnotations: false,
    theme: "dark" as const,
    ondisplaymodechange: vi.fn(),
    onannotationschange: vi.fn(),
    onthemechange: vi.fn(),
    onfitall: vi.fn(),
    onresetzoom: vi.fn(),
    onclose: vi.fn(),
    ...overrides,
  };

  render(MobileViewSheet, { props });
  return props;
}

describe("MobileViewSheet", () => {
  it("reflects current toggle state on open", () => {
    renderSheet({
      showAnnotations: true,
      theme: "dark",
    });

    expect(screen.getByRole("switch", { name: "Annotations" })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Theme/ })).toBeChecked();
  });

  it("calls ondisplaymodechange when display mode is changed", async () => {
    const props = renderSheet({ displayMode: "label" });

    await fireEvent.click(screen.getByRole("button", { name: "Image" }));

    expect(props.ondisplaymodechange).toHaveBeenCalledWith("image");
  });

  it("applies annotations and theme changes immediately", async () => {
    const props = renderSheet({
      showAnnotations: false,
      theme: "light",
    });

    await fireEvent.click(screen.getByRole("switch", { name: "Annotations" }));
    await fireEvent.click(screen.getByRole("switch", { name: /Theme/ }));

    expect(props.onannotationschange).toHaveBeenCalledWith(true);
    expect(props.onthemechange).toHaveBeenCalledWith("dark");
  });

  it("runs Fit All and closes sheet", async () => {
    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Fit All" }));

    expect(props.onfitall).toHaveBeenCalledTimes(1);
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("runs Reset Zoom and closes sheet", async () => {
    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: "Reset Zoom" }));

    expect(props.onresetzoom).toHaveBeenCalledTimes(1);
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });
});
