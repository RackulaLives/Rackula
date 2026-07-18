/**
 * dialog-actions behavioural tests
 *
 * Covers the handleDelete() seam shared by three of the five device-removal
 * affordances (Delete key, verb-bar trash, mobile sheet Remove). Device
 * removal is immediate with an undo toast (#2993); rack deletion still opens
 * the confirmDelete dialog, since a rack carries every device it holds.
 *
 * Also covers handleNewRack(), which creates a 24U rack directly on the canvas
 * and selects it (#2732). The New Rack wizard was removed in #2747, so no entry
 * point opens a dialog to create a rack.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  handleDelete,
  handleConfirmDelete,
  handleNewRack,
  seedStarterRack,
  formatRackDeleteMessage,
} from "$lib/utils/dialog-actions";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { createTestDeviceType, createTestRackDeleteTarget } from "./factories";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetToastStore();
  dialogStore.close();
  dialogStore.closeSheet();
}

/** Place one device in a new rack and select it. Returns rackId and device id. */
function placeAndSelectDevice() {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  const rack = layoutStore.addRack("Test Rack", 42);
  if (!rack) throw new Error("addRack returned null");

  const dt = createTestDeviceType({ slug: "test-server", u_height: 1 });
  layoutStore.addDeviceTypeRaw(dt);

  const ok = layoutStore.placeDevice(rack.id, dt.slug, 10, "front");
  if (!ok) throw new Error("placeDevice failed");

  const placed = layoutStore.getRackById(rack.id)!.devices[0]!;
  selectionStore.selectDevice(rack.id, placed.id);

  return { rackId: rack.id, deviceId: placed.id };
}

describe("handleDelete", () => {
  beforeEach(resetAll);

  // #2993: device removal is trivially undoable, so it's immediate with an
  // undo toast rather than gated behind the confirm dialog. This keeps the
  // Delete key, verb-bar trash, and mobile sheet Remove (all three route
  // through handleDelete) consistent with the desktop context-menu Delete
  // and edit panel Remove from Rack, which were already immediate.
  it("removes the device immediately without opening the confirmDelete dialog", () => {
    const { rackId, deviceId } = placeAndSelectDevice();
    const layoutStore = getLayoutStore();

    handleDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    expect(dialogStore.deleteTarget).toBeNull();
    expect(
      layoutStore.getRackById(rackId)!.devices.some((d) => d.id === deviceId),
    ).toBe(false);
  });

  it("clears the selection after removing the device", () => {
    placeAndSelectDevice();
    const selectionStore = getSelectionStore();

    handleDelete();

    expect(selectionStore.isDeviceSelected).toBe(false);
  });

  // The undo toast names the device type's model (falling back to slug), not
  // a custom instance name override: removeDeviceRecorded() resolves the
  // toast text from deviceType.model, and placeAndSelectDevice()'s device
  // type has a deterministic default model of "Test Device" (factories.ts).
  it("shows an undo toast naming the removed device", () => {
    placeAndSelectDevice();
    const toastStore = getToastStore();

    handleDelete();

    const toast = toastStore.toasts.find(
      (t) => t.message === "Removed Test Device",
    );
    expect(toast).toBeDefined();
    expect(toast?.action?.label).toBe("Undo");
  });

  it("undo toast action restores the exact device removed", () => {
    const { rackId, deviceId } = placeAndSelectDevice();
    const layoutStore = getLayoutStore();
    const before = layoutStore.getRackById(rackId)!.devices[0]!;

    handleDelete();
    const toastStore = getToastStore();
    toastStore.toasts[0]!.action?.onClick();

    const restored = layoutStore
      .getRackById(rackId)!
      .devices.find((d) => d.id === deviceId);
    expect(restored).toBeDefined();
    expect(restored?.position).toBe(before.position);
    expect(restored?.face).toBe(before.face);
  });

  it("does nothing when no device or rack is selected", () => {
    // No selection: handleDelete should be a no-op.
    handleDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    expect(dialogStore.deleteTarget).toBeNull();
  });

  // #2993, #3028: the undo toast's Undo button always targets the top of the
  // undo stack. If a later mutation is recorded before the user clicks Undo,
  // that button would silently revert the later mutation instead of
  // restoring the device the toast names. Repro: remove A, then move B
  // within the toast's window -- the stale "Removed A" toast must be gone
  // rather than left inviting a click that reverts B's move while A stays
  // removed.
  it("a later mutation dismisses the removal's undo toast (#2993, #3028)", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const toastStore = getToastStore();

    const rack = layoutStore.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack returned null");
    const dtA = createTestDeviceType({
      slug: "device-a",
      model: "Device A",
      u_height: 1,
    });
    const dtB = createTestDeviceType({
      slug: "device-b",
      model: "Device B",
      u_height: 1,
    });
    layoutStore.addDeviceTypeRaw(dtA);
    layoutStore.addDeviceTypeRaw(dtB);
    layoutStore.placeDevice(rack.id, dtA.slug, 10, "front");
    layoutStore.placeDevice(rack.id, dtB.slug, 20, "front");
    const deviceA = layoutStore.getRackById(rack.id)!.devices[0]!;
    const deviceB = layoutStore.getRackById(rack.id)!.devices[1]!;
    selectionStore.selectDevice(rack.id, deviceA.id);

    handleDelete();
    expect(
      toastStore.toasts.some((t) => t.message === "Removed Device A"),
    ).toBe(true);

    // A new undoable mutation is recorded before the toast is clicked.
    const bIndex = layoutStore
      .getRackById(rack.id)!
      .devices.findIndex((d) => d.id === deviceB.id);
    const moved = layoutStore.moveDevice(rack.id, bIndex, 21);
    expect(moved).toBe(true);

    // The stale "Removed A" toast is gone: there is nothing left to click
    // that would undo B's move instead of restoring A.
    expect(
      toastStore.toasts.some((t) => t.message === "Removed Device A"),
    ).toBe(false);
    // A stays removed; B's move stands. Neither was accidentally reverted.
    expect(
      layoutStore
        .getRackById(rack.id)!
        .devices.some((d) => d.id === deviceA.id),
    ).toBe(false);
    expect(
      layoutStore
        .getRackById(rack.id)!
        .devices.some((d) => d.id === deviceB.id),
    ).toBe(true);
  });
});

describe("handleDelete (rack selection)", () => {
  beforeEach(resetAll);

  // Rack deletion carries a much larger blast radius (every device the rack
  // holds), so it keeps the confirm dialog rather than moving to the
  // immediate-and-undoable policy device removal uses (#2993).
  it("opens the confirmDelete dialog when a rack is selected", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack returned null");
    selectionStore.selectRack(rack.id);

    handleDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
    expect(dialogStore.deleteTarget).toMatchObject({
      type: "rack",
      name: "Test Rack",
    });
  });
});

describe("handleConfirmDelete", () => {
  beforeEach(resetAll);

  // #2993: handleConfirmDelete now only ever acts on a rack target (device
  // removal bypasses this dialog entirely; see the handleDelete tests above).
  // #2918: deleteTarget must snapshot rackId at open time and act on that
  // snapshot, not the live selectionStore, so a selection change between
  // opening the dialog and confirming can't delete a different rack than the
  // one named in the dialog.
  it("deletes exactly the rack named in the dialog, even if selection moves to a different rack before confirm", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rackA = layoutStore.addRack("Rack A", 12);
    const rackB = layoutStore.addRack("Rack B", 12);
    if (!rackA || !rackB) throw new Error("addRack returned null");
    selectionStore.selectRack(rackA.id);

    handleDelete();
    expect(dialogStore.deleteTarget).toMatchObject({
      type: "rack",
      name: "Rack A",
    });

    // Selection moves to a different rack after the dialog opened but
    // before it's confirmed.
    selectionStore.selectRack(rackB.id);

    handleConfirmDelete();

    expect(layoutStore.getRackById(rackA.id)).toBeUndefined();
    expect(layoutStore.getRackById(rackB.id)).toBeDefined();
  });

  // The single-rack (non-bayed) branch used to call layoutStore.deleteRack()
  // and selectionStore.clearSelection() unconditionally, with no way to tell
  // whether the delete actually did anything. If the snapshotted rackId no
  // longer resolves to a live rack (e.g. some other action already removed
  // it while the dialog was open), deleteRack() silently no-ops -- clearing
  // the selection anyway would present a false success with nothing having
  // been deleted. Guard shape must match the bayed-member branch just above,
  // which already only clears selection when removeRackFromBay reports no
  // error.
  it("keeps the selection when the single-rack snapshot no longer resolves to a live rack", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    const rack = layoutStore.addRack("Test Rack", 12);
    if (!rack) throw new Error("addRack returned null");
    selectionStore.selectRack(rack.id);
    handleDelete();
    expect(dialogStore.deleteTarget).toMatchObject({ rackId: rack.id });

    // Simulate the rack having been removed by another action between
    // dialog-open and confirm (existence, rather than the #2918 identity
    // race the rackId snapshot already guards against).
    layoutStore.deleteRack(rack.id);
    expect(selectionStore.hasSelection).toBe(true);

    handleConfirmDelete();

    expect(selectionStore.hasSelection).toBe(true);
  });

  // #2994 fix round 2 introduced deleteBayedGroup as the atomic whole-group
  // delete path, but selection was cleared unconditionally after the branch
  // regardless of whether a live group resolved or deleteBayedGroup reported
  // failure. Both failure modes must retain the selection and leave the
  // group standing rather than presenting a silent success.
  describe("whole-group branch failure guard", () => {
    it("keeps the selection and deletes nothing when the snapshot's rackId no longer resolves to a live group", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const { group } = layoutStore.addBayedRackGroup("Bay", 2, 42, 19)!;
      const rackIds = [...group.rack_ids];
      selectionStore.selectGroup(group.id, rackIds[0]);

      // Stale snapshot: rackId (the documented anchor, #3606577249) no
      // longer resolves to any live group, even though groupRackIds still
      // lists real member racks -- proving resolution now keys off rackId,
      // not the first entry of the membership snapshot.
      dialogStore.deleteTarget = createTestRackDeleteTarget({
        name: "Bay",
        rackId: "not-a-real-rack-id",
        groupRackIds: rackIds,
      });

      handleConfirmDelete();

      expect(selectionStore.hasSelection).toBe(true);
      expect(selectionStore.selectedGroupId).toBe(group.id);
      for (const rackId of rackIds) {
        expect(layoutStore.getRackById(rackId)).toBeDefined();
      }
      expect(layoutStore.getRackGroupById(group.id)).toBeDefined();
    });

    it("keeps the selection and deletes nothing when deleteBayedGroup itself reports failure", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const rackA = layoutStore.addRack("Rack A", 12);
      const rackB = layoutStore.addRack("Rack B", 12);
      if (!rackA || !rackB) throw new Error("addRack returned null");
      // A "row" group is a real, live group but not a bayed one, so
      // deleteBayedGroup's own guard rejects it: { error: "Can only delete
      // a whole bayed rack group" }. This exercises the actual failure
      // return, not a simulated unresolved snapshot.
      const { group } = layoutStore.createRackGroup(
        "Row",
        [rackA.id, rackB.id],
        "row",
      );
      if (!group) throw new Error("createRackGroup returned no group");
      selectionStore.selectGroup(group.id, rackA.id);
      dialogStore.deleteTarget = createTestRackDeleteTarget({
        name: "Row",
        rackId: rackA.id,
        groupRackIds: [rackA.id, rackB.id],
      });

      handleConfirmDelete();

      expect(selectionStore.hasSelection).toBe(true);
      expect(layoutStore.getRackById(rackA.id)).toBeDefined();
      expect(layoutStore.getRackById(rackB.id)).toBeDefined();
      expect(layoutStore.getRackGroupById(group.id)).toBeDefined();
    });

    it("clears the selection once a whole-group delete actually succeeds", () => {
      const layoutStore = getLayoutStore();
      const selectionStore = getSelectionStore();
      const { group } = layoutStore.addBayedRackGroup("Bay", 2, 42, 19)!;
      const rackIds = [...group.rack_ids];
      selectionStore.selectGroup(group.id, rackIds[0]);
      dialogStore.deleteTarget = createTestRackDeleteTarget({
        name: "Bay",
        rackId: rackIds[0]!,
        groupRackIds: rackIds,
      });

      handleConfirmDelete();

      expect(selectionStore.hasSelection).toBe(false);
      for (const rackId of rackIds) {
        expect(layoutStore.getRackById(rackId)).toBeUndefined();
      }
    });
  });
});

describe("handleNewRack", () => {
  beforeEach(resetAll);

  it("creates a 24U rack and selects it, without opening the wizard", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const beforeIds = new Set(layoutStore.racks.map((rack) => rack.id));

    handleNewRack();

    const created = layoutStore.racks.find((rack) => !beforeIds.has(rack.id));
    expect(created).toBeDefined();
    expect(created?.height).toBe(24);
    expect(selectionStore.isRackSelected).toBe(true);
    expect(selectionStore.selectedRackId).toBe(created?.id);
    // No dialog is opened: the New Rack wizard was removed in #2747, so the
    // create path never opens a dialog.
    expect(dialogStore.openDialog).toBeNull();
  });

  it("applies stage-1 defaults (width 19, ascending U-numbering)", () => {
    const layoutStore = getLayoutStore();
    const beforeIds = new Set(layoutStore.racks.map((rack) => rack.id));

    handleNewRack();

    const created = layoutStore.racks.find((rack) => !beforeIds.has(rack.id));
    expect(created).toBeDefined();
    expect(created?.width).toBe(19);
    expect(created?.desc_units).toBe(false);
  });

  it("undo removes the rack it created", () => {
    const layoutStore = getLayoutStore();
    const beforeIds = new Set(layoutStore.racks.map((rack) => rack.id));

    handleNewRack();
    const created = layoutStore.racks.find((rack) => !beforeIds.has(rack.id));
    expect(created).toBeDefined();

    layoutStore.undo();

    expect(layoutStore.racks.some((rack) => rack.id === created?.id)).toBe(
      false,
    );
  });
});

describe("seedStarterRack (#3007/R6a)", () => {
  beforeEach(resetAll);

  it("creates a rack without flagging changesSinceExport before any user action", () => {
    const layoutStore = getLayoutStore();
    expect(layoutStore.changesSinceExport).toBe(0);

    seedStarterRack();

    expect(layoutStore.racks.length).toBe(1);
    expect(layoutStore.changesSinceExport).toBe(0);
    expect(layoutStore.hasEverExported).toBe(false);
  });

  it("leaves changesSinceExport at 0 even though the underlying seed (handleNewRack) would otherwise dirty it", () => {
    // Confirms the contrast the fix relies on: handleNewRack alone dirties
    // the counter (this is correct for every other add-rack affordance), so
    // seedStarterRack must be the one call site that resets it back.
    handleNewRack();
    expect(getLayoutStore().changesSinceExport).toBeGreaterThan(0);

    resetAll();
    seedStarterRack();

    expect(getLayoutStore().changesSinceExport).toBe(0);
  });
});

describe("zero-rack add-rack affordance", () => {
  beforeEach(resetAll);

  // The zero-rack canvas shows an inline "Add a rack" affordance whose button
  // routes through the same handleNewRack() path as the "+" toolbar action
  // (#2831). This covers the last-rack-deleted case: an emptied layout is never
  // a dead end because the affordance re-adds a rack.
  it("re-adds a rack after the last rack is deleted", () => {
    const layoutStore = getLayoutStore();

    const rack = layoutStore.addRack("Only Rack", 24);
    if (!rack) throw new Error("addRack returned null");
    expect(layoutStore.rackCount).toBe(1);

    // Deleting the last rack drives rackCount to 0, which is what surfaces the
    // affordance (Canvas renders it when rackCount === 0).
    layoutStore.deleteRack(rack.id);
    expect(layoutStore.rackCount).toBe(0);

    // The affordance's action adds a rack back.
    handleNewRack();
    expect(layoutStore.rackCount).toBe(1);
  });
});

describe("formatRackDeleteMessage", () => {
  // #2994: the rack-delete confirm's warning line used to be static ("All
  // devices in this rack will be removed") regardless of the rack's actual
  // contents, so an empty rack got the same devices-lost warning as a full
  // one. This asserts the count substitution: the number and singular/plural
  // wording vary with deviceCount, and the devices clause disappears entirely
  // for an empty rack rather than showing a false warning. Not pinned to the
  // exact non-count wording, so the surrounding copy can still be edited.
  it("omits the devices clause entirely for an empty rack", () => {
    const message = formatRackDeleteMessage("Test Rack", 0);
    expect(message).not.toMatch(/device/i);
  });

  it("names the rack being deleted even when it is empty", () => {
    const message = formatRackDeleteMessage("Test Rack", 0);
    expect(message).toContain("Test Rack");
  });

  it("includes the exact count for a rack with devices", () => {
    const message = formatRackDeleteMessage("Test Rack", 3);
    expect(message).toContain("3");
    expect(message).toMatch(/device/i);
  });

  it("uses singular wording for exactly one device", () => {
    const message = formatRackDeleteMessage("Test Rack", 1);
    expect(message).toMatch(/\b1 device\b/);
    expect(message).not.toMatch(/\b1 devices\b/);
  });

  it("uses plural wording for more than one device", () => {
    const message = formatRackDeleteMessage("Test Rack", 5);
    expect(message).toMatch(/\b5 devices\b/);
  });

  it("varies output between a 0-device and an N-device rack of the same name", () => {
    const empty = formatRackDeleteMessage("Test Rack", 0);
    const withDevices = formatRackDeleteMessage("Test Rack", 4);
    expect(empty).not.toBe(withDevices);
  });
});
