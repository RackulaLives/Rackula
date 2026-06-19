import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import MobileLayoutsSheet from "$lib/components/mobile/MobileLayoutsSheet.svelte";
import {
  getWorkspaceStore,
  resetWorkspaceStore,
} from "$lib/stores/workspace.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { createLayout } from "$lib/utils/serialization";

function renderSheet(
  overrides: Partial<{ onnewlayout: () => void; onclose: () => void }> = {},
) {
  const props = {
    onnewlayout: vi.fn(),
    onclose: vi.fn(),
    ...overrides,
  };
  render(MobileLayoutsSheet, { props });
  return props;
}

describe("MobileLayoutsSheet", () => {
  beforeEach(() => {
    // The first tab shares the app-session history singleton; reset it so each
    // test starts with a clean workspace and undo/redo stack.
    resetHistoryStore();
    resetWorkspaceStore();
    resetToastStore();
  });

  it("switches the active layout when a different layout row is tapped", async () => {
    const ws = getWorkspaceStore();
    const firstId = ws.activeId;
    ws.activeStore.setLayoutName("Homelab");

    // Open a second layout; it becomes active.
    const secondId = ws.openTab(createLayout("Office"));
    expect(ws.activeId).toBe(secondId);

    renderSheet();

    // Tapping the first layout's row switches focus back to it.
    await fireEvent.click(screen.getByRole("option", { name: /Homelab/ }));

    expect(ws.activeId).toBe(firstId);
  });

  it("marks exactly the active layout as selected", () => {
    const ws = getWorkspaceStore();
    ws.activeStore.setLayoutName("Homelab");
    const secondId = ws.openTab(createLayout("Office"));

    renderSheet();

    expect(ws.activeId).toBe(secondId);
    expect(screen.getByRole("option", { name: /Office/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: /Homelab/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("creates and activates a new layout from the sheet", async () => {
    const ws = getWorkspaceStore();
    const startingTabIds = ws.tabs.map((t) => t.id);

    renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /New layout/ }));

    const newTab = ws.tabs.find((t) => !startingTabIds.includes(t.id));
    expect(newTab).toBeDefined();
    expect(ws.activeId).toBe(newTab!.id);
  });

  it("closes the sheet after creating a new layout", async () => {
    const props = renderSheet();

    await fireEvent.click(screen.getByRole("button", { name: /New layout/ }));

    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it("closes the sheet after switching layouts", async () => {
    const ws = getWorkspaceStore();
    ws.activeStore.setLayoutName("Homelab");
    ws.openTab(createLayout("Office"));

    const props = renderSheet();

    await fireEvent.click(screen.getByRole("option", { name: /Homelab/ }));

    expect(props.onclose).toHaveBeenCalledTimes(1);
  });
});
