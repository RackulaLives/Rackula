/**
 * Issue #3005: the device edit panel used three different confirmation
 * models (colour applied live and silently, name committed on blur silently,
 * IP/Notes flashed a "Saved" check), and the rack edit panel's Name field
 * committed on blur with no acknowledgement while its siblings apply on
 * click. Both panels now commit on a discrete action (blur, or a picker
 * selection) and flash the same "Saved" acknowledgement used by IP/Notes, so
 * this covers the new state transitions that acknowledgement introduces.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
// SidePanelContent's Saved indicators render a Tooltip (#3005), which
// needs the Tooltip.Provider context App.svelte supplies in the real app.
import SidePanelContent from "./helpers/TestSidePanelContent.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { createTestDeviceTypeInput } from "./factories";
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

describe("Edit panel confirmation model (#3005)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
  });

  function setupSelectedDevice() {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rack = layoutStore.addRack("Test Rack", 42);
    const rackId = rack!.id;

    const deviceType = layoutStore.addDeviceType(
      createTestDeviceTypeInput({ name: "Server Type" }),
    );

    layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
    const device = layoutStore.rack!.devices[0]!;
    selectionStore.selectDevice(rackId, device.id);

    return { rackId, deviceId: device.id };
  }

  it("device Name flashes Saved after a committed blur edit, not on a no-op blur", async () => {
    setupSelectedDevice();
    renderEditTab();

    const editButton = screen.getByRole("button", {
      name: "Edit display name",
    });
    await fireEvent.click(editButton);
    const input = screen.getByLabelText("Name");

    // No-op: focus and blur without changing the value.
    await fireEvent.blur(input);
    expect(
      screen.queryByTestId("saved-indicator-name"),
    ).not.toBeInTheDocument();

    // Real edit: change the value and blur.
    await fireEvent.click(
      screen.getByRole("button", { name: "Edit display name" }),
    );
    await fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Renamed Device" },
    });
    await fireEvent.blur(screen.getByLabelText("Name"));

    await waitFor(() => {
      expect(screen.getByTestId("saved-indicator-name")).toBeInTheDocument();
    });
  });

  it("device Colour flashes Saved after picking a preset swatch", async () => {
    setupSelectedDevice();
    renderEditTab();

    await fireEvent.click(screen.getByRole("button", { name: "Colour" }));
    const swatchButtons = screen.getAllByRole("button", {
      name: /^Select .* colour$/,
    });
    await fireEvent.click(swatchButtons[0]!);

    await waitFor(() => {
      expect(screen.getByTestId("saved-indicator-colour")).toBeInTheDocument();
    });
  });

  it("rack Name flashes Saved after a committed blur edit, matching height/width/depth's visible feedback", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    selectionStore.selectRack(rack!.id);
    renderEditTab();

    const input = screen.getByLabelText("Name");
    await fireEvent.input(input, { target: { value: "Renamed Rack" } });
    await fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByTestId("saved-indicator-rack-name"),
      ).toBeInTheDocument();
    });
  });

  // Fix round 2 (#3005): the Saved-flash flags were component-global $state,
  // not tied to the edited entity. The edit panels stay mounted across
  // selection changes, so saving a field and switching selection within the
  // 2-second flash window showed the checkmark next to an entity that was
  // never saved.
  it("clears the device Name Saved indicator when switching to a different device within the flash window", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rack = layoutStore.addRack("Test Rack", 42);
    const rackId = rack!.id;

    const deviceType = layoutStore.addDeviceType(
      createTestDeviceTypeInput({ name: "Server Type" }),
    );

    layoutStore.placeDevice(rackId, deviceType.slug, 1, "front");
    layoutStore.placeDevice(rackId, deviceType.slug, 2, "front");
    const deviceA = layoutStore.rack!.devices[0]!;
    const deviceB = layoutStore.rack!.devices[1]!;

    selectionStore.selectDevice(rackId, deviceA.id);
    renderEditTab();

    await fireEvent.click(
      screen.getByRole("button", { name: "Edit display name" }),
    );
    await fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Renamed A" },
    });
    await fireEvent.blur(screen.getByLabelText("Name"));

    await waitFor(() => {
      expect(screen.getByTestId("saved-indicator-name")).toBeInTheDocument();
    });

    // Switch selection to device B, which was never saved, within the
    // 2-second flash window.
    selectionStore.selectDevice(rackId, deviceB.id);

    await waitFor(() => {
      expect(
        screen.queryByTestId("saved-indicator-name"),
      ).not.toBeInTheDocument();
    });
  });

  it("clears the rack Name Saved indicator when switching to a different rack within the flash window", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rackA = layoutStore.addRack("Rack A", 42)!;
    const rackB = layoutStore.addRack("Rack B", 42)!;

    selectionStore.selectRack(rackA.id);
    renderEditTab();

    const input = screen.getByLabelText("Name");
    await fireEvent.input(input, { target: { value: "Renamed A" } });
    await fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByTestId("saved-indicator-rack-name"),
      ).toBeInTheDocument();
    });

    // Switch selection to rack B, which was never saved, within the
    // 2-second flash window.
    selectionStore.selectRack(rackB.id);

    await waitFor(() => {
      expect(
        screen.queryByTestId("saved-indicator-rack-name"),
      ).not.toBeInTheDocument();
    });
  });
});
