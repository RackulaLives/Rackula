/**
 * Tests for Issue #2078: side panel View tab layout toggles.
 *
 * The View tab is always reachable (independent of selection) and holds the
 * layout-scoped view toggles: display mode, annotations, and rear view. It
 * mirrors existing store state rather than forking a second source of truth:
 * display mode is the same state as the canvas lens (#2074), and rear view is
 * the active rack's per-rack show_rear. Theme is an app preference and must not
 * appear here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import SidePanelContent from "$lib/components/SidePanelContent.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore, getUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

function renderViewTab() {
  return render(SidePanelContent, {
    props: { activeTab: "view", onTabChange: () => {} },
  });
}

describe("View tab layout toggles (#2078)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
  });

  it("is reachable with no selection and shows the view toggles", () => {
    renderViewTab();

    // The view toggles render regardless of selection (no empty state gate).
    expect(
      screen.getByRole("group", { name: /display mode/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /annotations/i }),
    ).toBeInTheDocument();
  });

  it("does not duplicate the theme control (app preference, lives in Settings)", () => {
    renderViewTab();

    expect(
      screen.queryByRole("switch", { name: /theme/i }),
    ).not.toBeInTheDocument();
  });

  it("changing display mode updates the shared store state", async () => {
    const user = userEvent.setup();
    const uiStore = getUIStore();
    expect(uiStore.displayMode).toBe("label");

    renderViewTab();

    await user.click(screen.getByRole("button", { name: /^image$/i }));

    expect(uiStore.displayMode).toBe("image");
  });

  it("display mode change persists to the layout settings", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    layoutStore.addRack("Test Rack", 42);

    renderViewTab();

    await user.click(screen.getByRole("button", { name: /^image$/i }));

    expect(layoutStore.layout.settings.display_mode).toBe("image");
  });

  it("toggling annotations updates the shared store state", async () => {
    const user = userEvent.setup();
    const uiStore = getUIStore();
    expect(uiStore.showAnnotations).toBe(false);

    renderViewTab();

    await user.click(screen.getByRole("switch", { name: /annotations/i }));

    expect(uiStore.showAnnotations).toBe(true);
  });

  it("rear view reflects and updates the active rack's show_rear", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    layoutStore.setActiveRack(rack!.id);

    renderViewTab();

    // Default for a new rack is show_rear: true, so "Hide" turns it off.
    await user.click(screen.getByRole("button", { name: /^hide$/i }));

    expect(layoutStore.getRackById(rack!.id)?.show_rear).toBe(false);
  });

  it("rear view fans out to every rack in a bayed group", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const result = layoutStore.addBayedRackGroup("Bayed Group", 2, 42);
    const group = result!.group;
    layoutStore.setActiveRack(group.rack_ids[0]!);

    renderViewTab();

    await user.click(screen.getByRole("button", { name: /^hide$/i }));

    for (const rackId of group.rack_ids) {
      expect(layoutStore.getRackById(rackId)?.show_rear).toBe(false);
    }
  });

  it("disables the rear view control when there is no active rack", () => {
    renderViewTab();

    // No racks exist after reset, so the active-rack-scoped control is disabled.
    const showButton = screen.getByRole("button", { name: /^show$/i });
    expect(showButton).toBeDisabled();
  });
});
