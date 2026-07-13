/**
 * EditPanelRack delete-confirm fold-in (#2994)
 *
 * The #2994 implementer guarded the context-menu, delete-key, and verb-bar
 * rack-deletion paths behind the shared confirmDelete dialog, but found a
 * sibling instance of the same defect: the side-panel "Delete Rack" button
 * (EditPanelRack.svelte) called layoutStore.deleteRack() directly, with no
 * confirm step, regardless of device count or bay membership. This routes it
 * through the same dialogStore.deleteTarget + confirmDelete flow every other
 * rack-deletion affordance uses, so it picks up the same device-aware warning
 * message (formatRackDeleteMessage) and the same #2918 rackId-snapshot
 * protection.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import TestSidePanelContent from "./helpers/TestSidePanelContent.svelte";
import { resetLayoutStore, getLayoutStore } from "$lib/stores/layout.svelte";
import {
  resetSelectionStore,
  getSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { handleConfirmDelete } from "$lib/utils/dialog-actions";
import { createTestDeviceType } from "./factories";

function renderEditTab() {
  return render(TestSidePanelContent, {
    props: { activeTab: "edit", onTabChange: () => {} },
  });
}

describe("EditPanelRack Delete Rack button (#2994 fold-in)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
    dialogStore.close();
    dialogStore.closeSheet();
  });

  it("opens the confirmDelete dialog instead of deleting the rack immediately", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    selectionStore.selectRack(rack.id);
    renderEditTab();

    await fireEvent.click(screen.getByRole("button", { name: "Delete rack" }));

    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
    expect(dialogStore.deleteTarget).toMatchObject({
      type: "rack",
      name: "Test Rack",
      rackId: rack.id,
    });
    // The rack must still exist: the dialog gates the deletion, it doesn't
    // happen on click.
    expect(layoutStore.getRackById(rack.id)).toBeDefined();
  });

  it("confirming the dialog deletes the rack named in it", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    selectionStore.selectRack(rack.id);
    renderEditTab();

    await fireEvent.click(screen.getByRole("button", { name: "Delete rack" }));
    handleConfirmDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    expect(layoutStore.getRackById(rack.id)).toBeUndefined();
  });

  // #2994's device-aware warning (formatRackDeleteMessage) reads the target
  // rack's live device count off dialogStore.deleteTarget.rackId at render
  // time (see DialogOrchestrator's deleteConfirmMessage), so the edit-panel
  // path only needs to hand off a correct rackId for that copy to apply here
  // too. This asserts the handoff, not the copy itself (already covered by
  // formatRackDeleteMessage's own tests in dialog-actions.test.ts).
  it("hands off the rack whose live device count drives the device-aware message", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    const dt = createTestDeviceType({ slug: "test-server", u_height: 1 });
    layoutStore.addDeviceTypeRaw(dt);
    layoutStore.placeDevice(rack.id, dt.slug, 10, "front");
    selectionStore.selectRack(rack.id);
    renderEditTab();

    await fireEvent.click(screen.getByRole("button", { name: "Delete rack" }));

    const target = dialogStore.deleteTarget;
    expect(target?.type).toBe("rack");
    expect(layoutStore.getRackById(target!.rackId)!.devices.length).toBe(1);
  });

  it("clears the selection once confirmed, matching the other guarded rack-delete paths", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const rack = layoutStore.addRack("Test Rack", 42)!;
    selectionStore.selectRack(rack.id);
    renderEditTab();

    await fireEvent.click(screen.getByRole("button", { name: "Delete rack" }));
    handleConfirmDelete();

    expect(selectionStore.hasSelection).toBe(false);
  });
});

// The "Delete Bayed Rack" button (selectedGroup branch of the same
// handleDeleteRack handler) had the identical unguarded-delete defect: it
// deleted every rack in the group directly, with no confirm step, regardless
// of device count. It now opens the same confirmDelete dialog, carrying every
// member rack id so handleConfirmDelete can delete them together and
// DialogOrchestrator can sum their live device counts for the warning.
describe("EditPanelRack Delete Bayed Rack button (#2994 fold-in)", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetToastStore();
    dialogStore.close();
    dialogStore.closeSheet();
  });

  it("opens the confirmDelete dialog instead of deleting the group immediately", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const { group } = layoutStore.addBayedRackGroup("Bay", 2, 42, 19)!;
    selectionStore.selectGroup(group.id, group.rack_ids[0]);
    renderEditTab();

    await fireEvent.click(
      screen.getByRole("button", { name: "Delete bayed rack" }),
    );

    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
    expect(dialogStore.deleteTarget).toMatchObject({
      type: "rack",
      groupRackIds: group.rack_ids,
    });
    for (const rackId of group.rack_ids) {
      expect(layoutStore.getRackById(rackId)).toBeDefined();
    }
  });

  it("confirming the dialog deletes every rack in the group", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const { group } = layoutStore.addBayedRackGroup("Bay", 2, 42, 19)!;
    const rackIds = [...group.rack_ids];
    selectionStore.selectGroup(group.id, rackIds[0]);
    renderEditTab();

    await fireEvent.click(
      screen.getByRole("button", { name: "Delete bayed rack" }),
    );
    handleConfirmDelete();

    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    for (const rackId of rackIds) {
      expect(layoutStore.getRackById(rackId)).toBeUndefined();
    }
    expect(layoutStore.getRackGroupById(group.id)).toBeUndefined();
  });

  it("hands off every member rack so the confirm message sums their live device counts", async () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    const { group } = layoutStore.addBayedRackGroup("Bay", 2, 42, 19)!;
    const [b1, b2] = group.rack_ids;
    const dt = createTestDeviceType({ slug: "test-server", u_height: 1 });
    layoutStore.addDeviceTypeRaw(dt);
    layoutStore.placeDevice(b1!, dt.slug, 5, "front");
    layoutStore.placeDevice(b2!, dt.slug, 5, "front");
    selectionStore.selectGroup(group.id, b1);
    renderEditTab();

    await fireEvent.click(
      screen.getByRole("button", { name: "Delete bayed rack" }),
    );

    const target = dialogStore.deleteTarget;
    expect(target?.groupRackIds).toEqual(group.rack_ids);
    const totalDevices = (target?.groupRackIds ?? []).reduce(
      (sum, rackId) =>
        sum + (layoutStore.getRackById(rackId)?.devices.length ?? 0),
      0,
    );
    expect(totalDevices).toBe(2);
  });
});
