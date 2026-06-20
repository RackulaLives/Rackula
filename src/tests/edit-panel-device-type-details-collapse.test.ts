/**
 * Tests for Issue #2443: collapsible "Device type details" block in the edit
 * panel.
 *
 * The read-only type facts live behind a disclosure toggle. The block defaults
 * to collapsed (#2535), and the expanded state is a single UI flag shared across
 * device selections (not stored per device), so toggling it stays sticky as the
 * user clicks between devices.
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

  it("defaults to collapsed, hiding the read-only facts but showing the count", () => {
    setupSelectedDevice();
    renderEditTab();

    const toggle = getDetailsToggle();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The read-only facts are hidden while the block is collapsed.
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();
    // The header surfaces the hidden-fact count, e.g. "Device type details (4)".
    expect(toggle).toHaveAccessibleName(/device type details\s*\(\d+\)/i);
  });

  it("toggling shows and hides the read-only facts", async () => {
    setupSelectedDevice();
    renderEditTab();

    const toggle = getDetailsToggle();

    // Expand: facts appear and aria-expanded flips to true.
    await fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText("Brand")).toBeInTheDocument();

    // Collapse again: facts disappear.
    await fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
    expect(screen.queryByText("Brand")).not.toBeInTheDocument();
  });

  it("keeps the expanded state across device selections (single UI flag)", async () => {
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

    // Expand while device A is selected (default is collapsed).
    await fireEvent.click(getDetailsToggle());
    await waitFor(() => {
      expect(getDetailsToggle()).toHaveAttribute("aria-expanded", "true");
    });

    // Switch to device B: the block stays expanded (sticky single flag).
    selectionStore.selectDevice(rackId, deviceB.id);
    await waitFor(() => {
      expect(selectionStore.selectedDeviceId).toBe(deviceB.id);
    });
    expect(getDetailsToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Brand")).toBeInTheDocument();
  });
});
