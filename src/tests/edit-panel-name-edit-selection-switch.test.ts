/**
 * Tests for Issue #2223: In-progress device name edit can be applied to the
 * wrong device when selection changes.
 *
 * The edit panel stays mounted across device selection changes. If you start
 * editing device A's display name and then select device B before committing,
 * the pending edit must NOT land on device B.
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
import { resetToastStore } from "$lib/stores/toast.svelte";

function renderEditTab() {
  return render(SidePanelContent, {
    props: { activeTab: "edit", onTabChange: () => {} },
  });
}

describe("EditPanel name edit + selection switch (#2223)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
  });

  it("does not apply an in-progress name edit to a newly selected device", async () => {
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

    // Two placements of the same device type at different positions.
    layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
    layoutStore.placeDevice(rackId, deviceType.slug, 2, "front");

    const deviceA = layoutStore.rack!.devices[0]!;
    const deviceB = layoutStore.rack!.devices[1]!;

    // Select device A and render the panel.
    selectionStore.selectDevice(rackId, deviceA.id);
    renderEditTab();

    // Enter edit mode for device A's name.
    const editButton = screen.getByRole("button", {
      name: /edit display name/i,
    });
    await fireEvent.click(editButton);

    // Type a new name for device A (do not commit yet).
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: "Name For A" } });

    // Switch selection to device B before committing.
    selectionStore.selectDevice(rackId, deviceB.id);
    await waitFor(() => {
      expect(selectionStore.selectedDeviceId).toBe(deviceB.id);
    });

    // Commit the in-progress edit (e.g. blur fires).
    await fireEvent.blur(nameInput);

    // Device B must NOT receive device A's in-progress name.
    const deviceBAfter = layoutStore.rack!.devices.find(
      (d) => d.id === deviceB.id,
    );
    expect(deviceBAfter?.name).not.toBe("Name For A");
  });

  it("still commits a name edit to the device being edited (no switch)", async () => {
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
    const deviceA = layoutStore.rack!.devices[0]!;

    selectionStore.selectDevice(rackId, deviceA.id);
    renderEditTab();

    const editButton = screen.getByRole("button", {
      name: /edit display name/i,
    });
    await fireEvent.click(editButton);

    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: "Renamed A" } });
    await fireEvent.blur(nameInput);

    const deviceAAfter = layoutStore.rack!.devices.find(
      (d) => d.id === deviceA.id,
    );
    expect(deviceAAfter?.name).toBe("Renamed A");
  });
});
