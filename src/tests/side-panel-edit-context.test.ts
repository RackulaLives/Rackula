/**
 * Tests for Issue #2077: side panel Edit tab contextual properties.
 *
 * The Edit tab in SidePanelContent must reflect the current selection: a device,
 * a single rack, a bayed rack group (the multi-rack case the selection model
 * supports), or nothing. The contextual heading names the selection kind and the
 * matching properties render; with no selection a clear empty state shows instead.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import SidePanelContent from "$lib/components/SidePanelContent.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { createTestDeviceTypeInput } from "./factories";

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

  it("shows the empty state and an Edit heading when nothing is selected and no racks exist", () => {
    renderEditTab();

    expect(screen.getByTestId("side-panel-edit-empty")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^edit$/i }),
    ).toBeInTheDocument();
  });

  it("defaults to rack mode for the active rack when nothing is selected (#2739)", () => {
    const layoutStore = getLayoutStore();

    // Two racks, none selected. The inspector defaults to rack mode for the
    // active rack rather than showing an empty panel.
    layoutStore.addRack("Rack A", 42);
    const rackB = layoutStore.addRack("Rack B", 24);
    layoutStore.setActiveRack(rackB!.id);

    renderEditTab();

    // Rack mode shows for the active rack (B): its name populates the Name field,
    // the Rack heading renders, and the empty state is absent.
    expect(
      screen.getByRole("heading", { name: /^rack$/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rack B")).toBeInTheDocument();
    expect(
      screen.queryByTestId("side-panel-edit-empty"),
    ).not.toBeInTheDocument();
  });

  it("resolves rack mode for the selected rack when a device selection goes stale (#2739)", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    // Rack B is active; a device in rack A is selected.
    const rackA = layoutStore.addRack("Rack A", 42);
    const rackB = layoutStore.addRack("Rack B", 24);
    layoutStore.setActiveRack(rackB!.id);
    const deviceType = layoutStore.addDeviceType({
      name: "Server Type",
      u_height: 1,
      category: "server",
      colour: "#4A90D9",
    });
    layoutStore.placeDevice(rackA!.id, deviceType.slug, 1, "front");
    const device = layoutStore.getRackById(rackA!.id)!.devices[0]!;
    selectionStore.selectDevice(rackA!.id, device.id);

    // The device is removed without clearing the selection, so the device
    // selection is stale: selectedType stays "device" and selectedRackId is rack A.
    layoutStore.removeDeviceFromRack(rackA!.id, 0);

    renderEditTab();

    // Rack mode resolves to rack A (the rack the stale selection points at), not
    // the active rack B.
    expect(screen.getByDisplayValue("Rack A")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Rack B")).not.toBeInTheDocument();
  });

  it("switches from rack mode to device mode when the selection changes (#2739)", async () => {
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

    // Start in rack mode with the rack selected.
    selectionStore.selectRack(rackId);
    renderEditTab();
    expect(
      screen.getByRole("button", { name: /delete rack/i }),
    ).toBeInTheDocument();

    // Selecting a device flips the panel to device mode with no manual tab change.
    selectionStore.selectDevice(rackId, device.id);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /edit display name/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /delete rack/i }),
    ).not.toBeInTheDocument();
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

  it("shows device properties without a redundant Device heading (#2525)", () => {
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

    // No "Device" heading: the Identity group's Name field already names the
    // device, inside a tab labelled "Edit" (#2525). The "Edit" empty-state
    // heading must also be absent, since a device is selected.
    expect(
      screen.queryByRole("heading", { name: /^device$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^edit$/i }),
    ).not.toBeInTheDocument();
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

// #2993: the edit panel's "Remove from Rack" is one of the two previously-
// silent device-removal paths (no dialog, no toast). It now shows an undo
// toast, matching the other four removal affordances.
describe("Edit panel Remove from Rack (#2993)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
  });

  // Not promoted to factories.ts: dialog-actions.test.ts and
  // rack-context-actions.test.ts have their own place-and-select helpers,
  // but they seed via createTestDeviceType()/addDeviceTypeRaw() at U10, while
  // this file consistently uses addDeviceType() (undo/dirty-tracking) at U1
  // to match every other test in this file. The store call and position
  // differ materially, so this stays local rather than forcing a shared
  // helper across incompatible setup patterns.
  function placeAndSelectDevice() {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    const rackId = rack!.id;
    const deviceType = layoutStore.addDeviceType(
      createTestDeviceTypeInput({ name: "Server Type" }),
    );
    layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
    const device = layoutStore.getRackById(rackId)!.devices[0]!;
    selectionStore.selectDevice(rackId, device.id);
    return { rackId, deviceId: device.id };
  }

  it("removes the device immediately and shows an undo toast, no confirm dialog", async () => {
    const { rackId, deviceId } = placeAndSelectDevice();
    const layoutStore = getLayoutStore();
    const toastStore = getToastStore();

    renderEditTab();
    await fireEvent.click(
      screen.getByRole("button", { name: /remove from rack/i }),
    );

    expect(
      layoutStore.getRackById(rackId)!.devices.some((d) => d.id === deviceId),
    ).toBe(false);
    const toast = toastStore.toasts.find((t) => t.action?.label === "Undo");
    expect(toast).toBeDefined();
    expect(toast?.message).toBe("Removed Server Type");
  });

  it("undo toast action restores the exact device removed", async () => {
    const { rackId, deviceId } = placeAndSelectDevice();
    const layoutStore = getLayoutStore();
    layoutStore.updateDeviceName(rackId, 0, "Core Switch");
    const before = layoutStore.getRackById(rackId)!.devices[0]!;

    renderEditTab();
    await fireEvent.click(
      screen.getByRole("button", { name: /remove from rack/i }),
    );
    const toastStore = getToastStore();
    toastStore.toasts[0]!.action?.onClick();

    const restored = layoutStore
      .getRackById(rackId)!
      .devices.find((d) => d.id === deviceId);
    expect(restored).toBeDefined();
    expect(restored?.position).toBe(before.position);
    expect(restored?.face).toBe(before.face);
    expect(restored?.name).toBe("Core Switch");
  });

  // #2993, #3028: the undo toast's Undo button always targets the top of the
  // undo stack. If a later mutation is recorded before the user clicks Undo,
  // that button would silently revert the later mutation instead of
  // restoring the device the toast names. Repro: remove A via "Remove from
  // Rack", then move B within the toast's window -- the stale "Removed A"
  // toast must be gone rather than left inviting a click that reverts B's
  // move while A stays removed.
  it("a later mutation dismisses the removal's undo toast (#2993, #3028)", async () => {
    const { rackId, deviceId } = placeAndSelectDevice();
    const layoutStore = getLayoutStore();
    const dtB = layoutStore.addDeviceType(
      createTestDeviceTypeInput({ name: "Device B" }),
    );
    layoutStore.placeDevice(rackId, dtB.slug, 20, "front");
    const deviceB = layoutStore.getRackById(rackId)!.devices[1]!;

    renderEditTab();
    const toastStore = getToastStore();
    await fireEvent.click(
      screen.getByRole("button", { name: /remove from rack/i }),
    );
    expect(
      toastStore.toasts.some((t) => t.message === "Removed Server Type"),
    ).toBe(true);

    // A new undoable mutation is recorded before the toast is clicked.
    const bIndex = layoutStore
      .getRackById(rackId)!
      .devices.findIndex((d) => d.id === deviceB.id);
    const moved = layoutStore.moveDevice(rackId, bIndex, 21);
    expect(moved).toBe(true);

    // The stale "Removed A" toast is gone: there is nothing left to click
    // that would undo B's move instead of restoring A.
    expect(
      toastStore.toasts.some((t) => t.message === "Removed Server Type"),
    ).toBe(false);
    expect(
      layoutStore.getRackById(rackId)!.devices.some((d) => d.id === deviceId),
    ).toBe(false);
    expect(
      layoutStore.getRackById(rackId)!.devices.some((d) => d.id === deviceB.id),
    ).toBe(true);
  });
});
