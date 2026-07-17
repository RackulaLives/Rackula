/**
 * Issue #3005: pressing Escape while the device colour picker popover was
 * open bubbled to the global KeyboardHandler, which cleared the entire
 * device selection instead of just closing the popover. This asserts Escape
 * closes only the popover and leaves the device selection intact, with the
 * real global KeyboardHandler mounted alongside the edit panel so the
 * regression is exercised end to end rather than in isolation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import SidePanelContent from "$lib/components/SidePanelContent.svelte";
import KeyboardHandler from "$lib/components/KeyboardHandler.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import { createTestDeviceTypeInput } from "./factories";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";

function renderEditTabWithGlobalKeyboard() {
  render(KeyboardHandler);
  return render(SidePanelContent, {
    props: { activeTab: "edit", onTabChange: () => {} },
  });
}

function getColourToggle() {
  return screen.getByRole("button", { name: "Colour" });
}

describe("EditPanelMetadata colour picker Escape (#3005)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
    dialogStore.close();
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

    return { layoutStore, selectionStore, rackId, deviceId: device.id };
  }

  it("Escape closes only the popover, leaving the device selection intact", async () => {
    const { selectionStore, deviceId } = setupSelectedDevice();
    renderEditTabWithGlobalKeyboard();

    const toggle = getColourToggle();
    await fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    await fireEvent.keyDown(toggle, { key: "Escape" });

    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
    expect(selectionStore.selectedDeviceId).toBe(deviceId);
    expect(selectionStore.hasSelection).toBe(true);
  });

  it("Escape with the popover closed still clears the device selection", async () => {
    const { selectionStore } = setupSelectedDevice();
    renderEditTabWithGlobalKeyboard();

    expect(selectionStore.hasSelection).toBe(true);

    await fireEvent.keyDown(window, { key: "Escape" });

    expect(selectionStore.hasSelection).toBe(false);
  });
});
