/**
 * Tests for Issue #2443: collapsible "Device type details" block in the edit
 * panel.
 *
 * The read-only type facts live behind a disclosure toggle. The block defaults
 * to expanded, and the collapsed state is a single UI flag shared across device
 * selections (not stored per device), so toggling it stays sticky as the user
 * clicks between devices.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import SidePanelContent from "$lib/components/SidePanelContent.svelte";
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

function getDetailsToggle() {
  return screen.getByRole("button", { name: /device type details/i });
}

describe("EditPanel Device type details collapse (#2443)", () => {
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

    return { layoutStore, selectionStore, rackId };
  }

  it("defaults to expanded, showing the read-only facts", () => {
    setupSelectedDevice();
    renderEditTab();

    expect(getDetailsToggle()).toHaveAttribute("aria-expanded", "true");
    // A read-only fact label is visible when the block is expanded.
    expect(screen.getByText("Brand")).toBeInTheDocument();
  });

  it("toggling hides and shows the read-only facts", async () => {
    setupSelectedDevice();
    renderEditTab();

    const toggle = getDetailsToggle();

    // Collapse: facts disappear and aria-expanded flips to false.
    await fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();

    // Expand again: facts come back.
    await fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText("Brand")).toBeInTheDocument();
  });

  it("keeps the collapsed state across device selections (single UI flag)", async () => {
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

    // Collapse while device A is selected.
    await fireEvent.click(getDetailsToggle());
    await waitFor(() => {
      expect(getDetailsToggle()).toHaveAttribute("aria-expanded", "false");
    });

    // Switch to device B: the block stays collapsed (sticky single flag).
    selectionStore.selectDevice(rackId, deviceB.id);
    await waitFor(() => {
      expect(selectionStore.selectedDeviceId).toBe(deviceB.id);
    });
    expect(getDetailsToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();
  });
});
