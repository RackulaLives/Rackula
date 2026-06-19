import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import MobileRacksSheet from "$lib/components/mobile/MobileRacksSheet.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

function renderSheet(
  overrides: Partial<{ onnewrack: () => void; onclose: () => void }> = {},
) {
  const props = {
    onnewrack: vi.fn(),
    onclose: vi.fn(),
    ...overrides,
  };
  render(MobileRacksSheet, { props });
  return props;
}

describe("MobileRacksSheet", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
    dialogStore.closeSheet();
  });

  it("lists every rack in the current layout", () => {
    const layout = getLayoutStore();
    layout.addRack("Edge", 42);
    layout.addRack("Core", 24);

    renderSheet();

    expect(screen.getByRole("button", { name: /Edge/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Core/ })).toBeInTheDocument();
  });

  it("opens rack properties for the tapped rack", async () => {
    const layout = getLayoutStore();
    layout.addRack("Edge", 42);
    const core = layout.addRack("Core", 24);

    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /Core/ }));

    // The tapped rack becomes active and the rack-edit sheet opens, so editing
    // is reachable without the long-press shortcut.
    expect(layout.activeRackId).toBe(core!.id);
    expect(dialogStore.isSheetOpen("rackEdit")).toBe(true);
  });

  it("selects the tapped rack so the edit sheet acts on it", async () => {
    const layout = getLayoutStore();
    const edge = layout.addRack("Edge", 42);

    const selection = getSelectionStore();
    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /Edge/ }));

    expect(selection.isRackSelected).toBe(true);
    expect(selection.selectedRackId).toBe(edge!.id);
  });

  it("closes the racks sheet after opening rack properties", async () => {
    const layout = getLayoutStore();
    layout.addRack("Edge", 42);

    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /Edge/ }));

    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("raises the New Rack flow and closes the sheet from the New rack action", async () => {
    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /New rack/ }));

    expect(props.onnewrack).toHaveBeenCalledTimes(1);
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });
});
