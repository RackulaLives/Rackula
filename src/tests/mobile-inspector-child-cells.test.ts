/**
 * Mobile inspector cell moves for a selected carrier child (#3340). Up and
 * down move the child between rows, and a child also gets left and right
 * verbs, each enabled only toward a free cell.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import DialogOrchestrator from "$lib/components/DialogOrchestrator.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { CATEGORY_COLOURS } from "$lib/types/constants";

function setMobileViewport(isMobile: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) =>
      ({
        matches: isMobile,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as MediaQueryList,
  });
  resetViewportStore();
}

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
  resetSelectionStore();
  setMobileViewport(true);
});

afterEach(() => {
  dialogStore.closeSheet();
  setMobileViewport(false);
});

/** A 12U rack with a half-width switch dropped at U5, in a new carrier. */
function setup() {
  const store = getLayoutStore();
  const rack = store.addRack("Test Rack", 12)!;
  const switchType = store.addDeviceType({
    name: "Mini Switch",
    u_height: 1,
    category: "network",
    colour: CATEGORY_COLOURS.network,
    slot_width: 1,
  });
  store.placeDeviceSmart(rack.id, switchType.slug, 5);
  store.setActiveRack(rack.id);
  const devices = store.getRackById(rack.id)!.devices;
  return {
    store,
    rackId: rack.id,
    carrier: devices.find((d) => !d.container_id)!,
    child: devices.find((d) => d.container_id)!,
  };
}

describe("mobile inspector cell moves for a carrier child (#3340)", () => {
  it("moves a selected child into the free cell on its right", async () => {
    const { store, rackId, child } = setup();
    getSelectionStore().selectDevice(rackId, child.id);
    render(DialogOrchestrator);

    expect(
      await screen.findByRole("button", { name: "Move to cell left" }),
    ).toBeDisabled();
    await fireEvent.click(
      screen.getByRole("button", { name: "Move to cell right" }),
    );

    const moved = store
      .getRackById(rackId)!
      .devices.find((d) => d.id === child.id)!;
    expect(moved.slot_id).toBe("col-2");
  });

  it("offers no left or right move for a rack-level device", async () => {
    const { rackId, carrier } = setup();
    getSelectionStore().selectDevice(rackId, carrier.id);
    render(DialogOrchestrator);

    expect(
      await screen.findByRole("button", { name: "Move device up" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Move to cell right" }),
    ).not.toBeInTheDocument();
  });
});
