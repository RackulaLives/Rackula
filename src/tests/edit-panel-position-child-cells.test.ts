/**
 * Edit panel move controls for a selected carrier child (#3340). They were
 * disabled for children; they now move the child between the cells of its
 * carrier through the same actions as the arrow keys.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import EditPanelPosition from "$lib/components/EditPanelPosition.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { CATEGORY_COLOURS } from "$lib/types/constants";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
  resetSelectionStore();
});

/** A half-width switch dropped at U5 (column 1 of a new 2-column carrier), selected. */
function renderPanelForChild() {
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
  const devices = store.getRackById(rack.id)!.devices;
  const deviceIndex = devices.findIndex((d) => d.container_id);
  const child = devices[deviceIndex]!;
  getSelectionStore().selectDevice(rack.id, child.id);

  render(EditPanelPosition, {
    props: {
      selectedDeviceInfo: {
        device: switchType,
        placedDevice: child,
        rack: store.getRackById(rack.id)!,
        deviceIndex,
      },
    },
  });
  return { store, rackId: rack.id, childId: child.id };
}

describe("EditPanelPosition cell controls for a carrier child (#3340)", () => {
  it("enables only the directions with a free cell", () => {
    renderPanelForChild();

    expect(
      screen.getByRole("button", { name: /cell on the right/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /cell on the left/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /cell above/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cell below/ })).toBeDisabled();
  });

  it("moves the child into the next cell", async () => {
    const { store, rackId, childId } = renderPanelForChild();

    await fireEvent.click(
      screen.getByRole("button", { name: /cell on the right/ }),
    );

    const moved = store
      .getRackById(rackId)!
      .devices.find((d) => d.id === childId)!;
    expect(moved.slot_id).toBe("col-2");
  });
});
