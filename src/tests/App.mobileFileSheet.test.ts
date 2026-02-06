import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import App from "../App.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";

function createMatchMediaResult(
  query: string,
  matches: boolean,
): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

describe("App mobile file sheet", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    resetPlacementStore();
    resetImageStore();
    resetHistoryStore();
    resetToastStore();
    resetViewportStore();
    dialogStore.close();
    dialogStore.closeSheet();

    vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
      createMatchMediaResult(query, query === "(max-width: 1024px)"),
    );
  });

  it("opens the file sheet when File tab is tapped", async () => {
    render(App);

    const fileTab = await screen.findByRole("button", { name: "File" });
    await fireEvent.click(fileTab);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Load Layout" }),
      ).toBeInTheDocument();
    });
  }, 60000);
});
