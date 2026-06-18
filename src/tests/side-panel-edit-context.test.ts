/**
 * Tests for Issue #2077: side panel Edit tab contextual properties.
 *
 * The Edit tab in SidePanelContent must reflect the current selection: a device,
 * a single rack, a bayed rack group (the multi-rack case the selection model
 * supports), or nothing. The contextual heading names the selection kind and the
 * matching properties render; with no selection a clear empty state shows instead.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import SidePanelContent from "$lib/components/SidePanelContent.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";

function renderEditTab() {
  return render(SidePanelContent, {
    props: { activeTab: "edit", onTabChange: () => {} },
  });
}

describe("Edit tab contextual properties (#2077)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
  });

  it("shows the empty state and an Edit heading when nothing is selected", () => {
    renderEditTab();

    expect(
      screen.getByTestId("side-panel-edit-empty"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^edit$/i }),
    ).toBeInTheDocument();
  });

  it("names a single rack and shows its rack properties", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rack = layoutStore.addRack("Test Rack", 42);
    selectionStore.selectRack(rack!.id);

    renderEditTab();

    expect(
      screen.getByRole("heading", { name: /^rack$/i }),
    ).toBeInTheDocument();
    // The rack properties (delete action) render, not the empty state.
    expect(
      screen.getByRole("button", { name: /delete rack/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("side-panel-edit-empty"),
    ).not.toBeInTheDocument();
  });

  it("populates the panel for a selected rack even when a different rack is active", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    // Two racks. Rack A is the active rack; rack B is the one the user selects
    // via the canvas click target / title (#2407). Selection alone must populate
    // the Edit panel, regardless of which rack the store considers active.
    const rackA = layoutStore.addRack("Rack A", 42);
    const rackB = layoutStore.addRack("Rack B", 24);
    layoutStore.setActiveRack(rackA!.id);
    selectionStore.selectRack(rackB!.id);

    renderEditTab();

    // The panel resolves to the SELECTED rack (B), not the empty state.
    expect(
      screen.getByRole("heading", { name: /^rack$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete rack/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("side-panel-edit-empty"),
    ).not.toBeInTheDocument();
    // The body shows rack B's properties: its name appears in the name field.
    expect(screen.getByDisplayValue("Rack B")).toBeInTheDocument();
  });

  it("names a bayed rack group as the multi-rack selection", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const result = layoutStore.addBayedRackGroup("Bayed Group", 2, 42);
    const group = result!.group;
    selectionStore.selectGroup(group.id, group.rack_ids[0]);

    renderEditTab();

    expect(
      screen.getByRole("heading", { name: /bayed rack/i }),
    ).toBeInTheDocument();
    // Group-level delete action proves the group body rendered.
    expect(
      screen.getByRole("button", { name: /delete bayed rack/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("side-panel-edit-empty"),
    ).not.toBeInTheDocument();
  });

  it("names a selected device and shows its device properties", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rack = layoutStore.addRack("Test Rack", 42);
    const rackId = rack!.id;
    const deviceType = layoutStore.addDeviceType({
      name: "Server Type",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });
    layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
    const device = layoutStore.rack!.devices[0]!;
    selectionStore.selectDevice(rackId, device.id);

    renderEditTab();

    expect(
      screen.getByRole("heading", { name: /^device$/i }),
    ).toBeInTheDocument();
    // The device name editor proves the device body rendered.
    expect(
      screen.getByRole("button", { name: /edit display name/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("side-panel-edit-empty"),
    ).not.toBeInTheDocument();
  });

  it("counts device-type placements across all racks in the delete confirmation", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    // The same custom device type is placed in two different racks. Deleting the
    // type removes every instance layout-wide, so the confirmation must report
    // the whole-layout count, not just the selected rack's.
    const rackA = layoutStore.addRack("Rack A", 42);
    const rackB = layoutStore.addRack("Rack B", 42);
    const deviceType = layoutStore.addDeviceType({
      name: "Shared Server",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });
    layoutStore.placeDevice(rackA!.id, deviceType.slug, 1, "front");
    layoutStore.placeDevice(rackB!.id, deviceType.slug, 1, "front");

    // Select the instance in rack A.
    const deviceInA = layoutStore
      .getRackById(rackA!.id)!
      .devices.find((d) => d.device_type === deviceType.slug)!;
    selectionStore.selectDevice(rackA!.id, deviceInA.id);

    renderEditTab();

    // Trigger the delete-device-type flow.
    await fireEvent.click(
      screen.getByRole("button", { name: /delete from library/i }),
    );

    // The confirmation reports both placements, not just the one in rack A.
    expect(screen.getByText(/placed 2 times/i)).toBeInTheDocument();
  });
});
