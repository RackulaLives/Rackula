/**
 * app-actions behavioural tests
 *
 * Covers resetAndOpenNewRack(), which the New Rack wizard removal (#2747)
 * rewired to create a rack directly. The critical invariant is ordering: the
 * layout is reset FIRST, then a fresh rack is created on the cleared layout, so
 * the result is exactly one rack (the new one) rather than the old rack plus a
 * new one.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { resetAndOpenNewRack } from "$lib/utils/app-actions";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetImageStore();
  dialogStore.close();
  dialogStore.closeSheet();
}

describe("resetAndOpenNewRack", () => {
  beforeEach(resetAll);

  it("resets the layout first, then creates a single fresh rack", () => {
    const layoutStore = getLayoutStore();
    // Seed a pre-existing rack so a reset that runs before create is observable:
    // if create ran without the reset, the layout would end up with two racks.
    const existing = layoutStore.addRack("Old Rack", 42);
    expect(existing).not.toBeNull();

    resetAndOpenNewRack();

    // The old rack is gone (reset) and exactly one new rack remains (create).
    expect(layoutStore.racks.length).toBe(1);
    expect(layoutStore.racks.some((rack) => rack.id === existing?.id)).toBe(
      false,
    );
  });

  it("selects the freshly created rack and opens no dialog", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    resetAndOpenNewRack();

    const created = layoutStore.racks[0];
    expect(created).toBeDefined();
    expect(selectionStore.isRackSelected).toBe(true);
    expect(selectionStore.selectedRackId).toBe(created?.id);
    // The wizard was removed in #2747, so this path never opens a dialog.
    expect(dialogStore.openDialog).toBeNull();
  });
});
