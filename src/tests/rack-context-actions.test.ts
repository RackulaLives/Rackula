/**
 * rack-context-actions behavioural tests
 *
 * Covers the desktop context-menu Delete affordance, one of the two
 * previously-silent device-removal paths (no dialog, no toast) unified by
 * #2993 with the other three affordances that already routed through the
 * confirm dialog. It now removes immediately with an undo toast, matching
 * handleDelete()'s device branch in dialog-actions.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createContextMenuActions } from "$lib/utils/rack-context-actions";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { createTestDeviceType } from "./factories";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetToastStore();
}

/** Place one device in a new rack. Returns rackId, deviceId, and the target. */
function placeDevice() {
  const layoutStore = getLayoutStore();
  const rack = layoutStore.addRack("Test Rack", 42);
  if (!rack) throw new Error("addRack returned null");

  const dt = createTestDeviceType({ slug: "test-server", u_height: 1 });
  layoutStore.addDeviceTypeRaw(dt);

  const ok = layoutStore.placeDevice(rack.id, dt.slug, 10, "front");
  if (!ok) throw new Error("placeDevice failed");

  const placed = layoutStore.getRackById(rack.id)!.devices[0]!;
  return {
    rackId: rack.id,
    deviceId: placed.id,
    target: { rackId: rack.id, deviceIndex: 0, x: 0, y: 0 },
  };
}

describe("createContextMenuActions().handleDelete", () => {
  beforeEach(resetAll);

  it("removes the device immediately with no confirm step", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      toastStore,
    );
    const { rackId, deviceId, target } = placeDevice();

    actions.handleDelete(target);

    expect(
      layoutStore.getRackById(rackId)!.devices.some((d) => d.id === deviceId),
    ).toBe(false);
  });

  it("clears the selection after removing the device", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      toastStore,
    );
    const { rackId, deviceId, target } = placeDevice();
    selectionStore.selectDevice(rackId, deviceId);

    actions.handleDelete(target);

    expect(selectionStore.isDeviceSelected).toBe(false);
  });

  it("shows an undo toast naming the removed device", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      toastStore,
    );
    const { target } = placeDevice();

    actions.handleDelete(target);

    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: exactly one removal produces exactly one toast
    expect(toastStore.toasts).toHaveLength(1);
    expect(toastStore.toasts[0]!.message).toContain("Removed");
    expect(toastStore.toasts[0]!.action?.label).toBe("Undo");
  });

  // Undo must restore the exact placement: same device, position, and face
  // (#2993 J3: the undo store already round-trips removal; this affordance
  // just has to reach it).
  it("undo toast action restores the exact device removed", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      toastStore,
    );
    const { rackId, deviceId, target } = placeDevice();
    const before = layoutStore.getRackById(rackId)!.devices[0]!;

    actions.handleDelete(target);
    toastStore.toasts[0]!.action?.onClick();

    const restored = layoutStore
      .getRackById(rackId)!
      .devices.find((d) => d.id === deviceId);
    expect(restored).toBeDefined();
    expect(restored?.position).toBe(before.position);
    expect(restored?.face).toBe(before.face);
  });

  // A custom display name and colour override are part of the placement, not
  // the device type, so undo must restore them exactly, not just re-place a
  // default instance of the same device type.
  it("undo restores a custom name and colour override", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      toastStore,
    );
    const { rackId, deviceId, target } = placeDevice();
    // Not a design token: an arbitrary user-set override whose round-trip
    // through remove-then-undo is the behaviour under test.
    const customColour = "#ff0000";
    layoutStore.updateDeviceName(rackId, 0, "Core Switch");
    layoutStore.updateDeviceColour(rackId, 0, customColour);

    actions.handleDelete(target);
    toastStore.toasts[0]!.action?.onClick();

    const restored = layoutStore
      .getRackById(rackId)!
      .devices.find((d) => d.id === deviceId);
    expect(restored?.name).toBe("Core Switch");
    expect(restored?.colour_override).toBe(customColour);
  });
});
