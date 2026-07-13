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

  // The undo toast names the device type's model (falling back to slug), not
  // a custom instance name override: removeDeviceRecorded() resolves the
  // toast text from deviceType.model, and placeDevice()'s device type has a
  // deterministic default model of "Test Device" (factories.ts).
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

    const toast = toastStore.toasts.find(
      (t) => t.message === "Removed Test Device",
    );
    expect(toast).toBeDefined();
    expect(toast?.action?.label).toBe("Undo");
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
    const customColour = createTestDeviceType().colour;
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

  // #2993, #3028: the undo toast's Undo button always targets the top of the
  // undo stack. If a later mutation is recorded before the user clicks Undo,
  // that button would silently revert the later mutation instead of
  // restoring the device the toast names. Repro: remove A via the context
  // menu, then flip B's face within the toast's window -- the stale
  // "Removed A" toast must be gone rather than left inviting a click that
  // reverts B's flip while A stays removed.
  it("a later mutation dismisses the removal's undo toast (#2993, #3028)", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      toastStore,
    );
    const { target: targetA } = placeDevice();
    const rack = layoutStore.getRackById(targetA.rackId)!;
    const dtB = createTestDeviceType({
      slug: "device-b",
      model: "Device B",
      u_height: 1,
      // Not full-depth: full-depth devices are always mounted "both" faces
      // and can't be flipped, which would make handleFlip a no-op here.
      is_full_depth: false,
    });
    layoutStore.addDeviceTypeRaw(dtB);
    layoutStore.placeDevice(rack.id, dtB.slug, 20, "front");
    const deviceB = layoutStore.getRackById(rack.id)!.devices[1]!;

    actions.handleDelete(targetA);
    expect(
      toastStore.toasts.some((t) => t.message === "Removed Test Device"),
    ).toBe(true);

    // A new undoable mutation is recorded before the toast is clicked.
    const bIndex = layoutStore
      .getRackById(rack.id)!
      .devices.findIndex((d) => d.id === deviceB.id);
    actions.handleFlip(layoutStore.getRackById(rack.id)!, {
      rackId: rack.id,
      deviceIndex: bIndex,
      x: 0,
      y: 0,
    });

    // The stale "Removed A" toast is gone: there is nothing left to click
    // that would undo B's flip instead of restoring A.
    expect(
      toastStore.toasts.some((t) => t.message === "Removed Test Device"),
    ).toBe(false);
    expect(
      layoutStore.getRackById(rack.id)!.devices.find((d) => d.id === deviceB.id)
        ?.face,
    ).toBe("rear");
  });
});
