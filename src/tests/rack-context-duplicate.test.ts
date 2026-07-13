/**
 * rack-actions (context-menu) behavioural tests for handleRackContextDuplicate.
 *
 * Covers #3003 (J4-F3, J4-F5): duplicateRack activated the copy without
 * updating the selection store, so the sidebar (active) and the canvas
 * outline / edit panel / delete target (selected) disagreed about which
 * rack was "current" after a duplicate. The copy was also appended beyond
 * the viewport edge with no re-fit, becoming active while invisible.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleRackContextDuplicate } from "$lib/utils/rack-actions";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { handleDelete, handleConfirmDelete } from "$lib/utils/dialog-actions";
import * as appActions from "$lib/utils/app-actions";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetToastStore();
  dialogStore.close();
}

describe("handleRackContextDuplicate", () => {
  beforeEach(resetAll);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps active and selected in sync on the copy", () => {
    const layoutStore = getLayoutStore();
    const selection = getSelectionStore();
    const rack = layoutStore.addRack("Source Rack", 42)!;

    handleRackContextDuplicate(rack.id);

    const newRack = layoutStore.racks.find((r) => r.id !== rack.id);
    expect(newRack).toBeDefined();
    expect(layoutStore.activeRackId).toBe(newRack!.id);
    expect(selection.selectedRackId).toBe(newRack!.id);
  });

  // handleRackContextDelete resolves its target from the rack id it is
  // invoked with directly (the right-clicked rack), so it can never
  // reproduce the desync bug. The Delete key / verb-bar trash affordance
  // (handleDelete) is the one that reads the live selection, so it is the
  // one that must target the copy after a duplicate (AC2).
  it("targets the copy, not the source, when Delete follows a duplicate", () => {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Source Rack", 42)!;

    handleRackContextDuplicate(rack.id);
    const newRack = layoutStore.racks.find((r) => r.id !== rack.id)!;

    handleDelete();
    expect(dialogStore.deleteTarget?.rackId).toBe(newRack.id);
    handleConfirmDelete();

    expect(layoutStore.getRackById(newRack.id)).toBeUndefined();
    expect(layoutStore.getRackById(rack.id)).toBeDefined();
  });

  // Fix round 1 (#3003): same defect class reintroduced in the undo path.
  // The post-duplicate selectRack() call landed outside the command/history
  // system, so undo restored activeRackId to the source (#2976) but left
  // selectedRackId dangling on the now-deleted copy's id. Undo must leave
  // both pointing at the source; redo must put both back on the copy.
  it("keeps active and selected coherent through duplicate undo and redo", () => {
    const layoutStore = getLayoutStore();
    const selection = getSelectionStore();
    const rack = layoutStore.addRack("Source Rack", 42)!;
    layoutStore.setActiveRack(rack.id);
    selection.selectRack(rack.id);

    handleRackContextDuplicate(rack.id);
    const newRack = layoutStore.racks.find((r) => r.id !== rack.id);
    expect(newRack).toBeDefined();
    expect(layoutStore.activeRackId).toBe(newRack!.id);
    expect(selection.selectedRackId).toBe(newRack!.id);

    layoutStore.undo();
    expect(layoutStore.activeRackId).toBe(rack.id);
    expect(selection.selectedRackId).toBe(rack.id);
    expect(layoutStore.getRackById(newRack!.id)).toBeUndefined();

    layoutStore.redo();
    expect(layoutStore.activeRackId).toBe(newRack!.id);
    expect(selection.selectedRackId).toBe(newRack!.id);
  });

  it("fits the copy into view, mirroring handleNewRack", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const fitAllSpy = vi
      .spyOn(appActions, "handleFitAll")
      .mockReturnValue(undefined);
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Source Rack", 42)!;

    handleRackContextDuplicate(rack.id);

    expect(fitAllSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
