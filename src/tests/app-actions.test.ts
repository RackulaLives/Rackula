/**
 * app-actions behavioural tests
 *
 * Covers resetAndCreateNewRack(), which the New Rack wizard removal (#2747)
 * rewired to create a rack directly. The critical invariant is ordering: the
 * layout is reset FIRST, then a fresh rack is created on the cleared layout, so
 * the result is exactly one rack (the new one) rather than the old rack plus a
 * new one.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetAndCreateNewRack,
  handleExportSubmit,
} from "$lib/utils/app-actions";
import { downloadBlob } from "$lib/utils/export";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import type { ExportOptions } from "$lib/types";

vi.mock("$lib/utils/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/utils/export")>();
  return { ...actual, downloadBlob: vi.fn() };
});

const mockedDownloadBlob = vi.mocked(downloadBlob);

function resetAll() {
  resetLayoutStore();
  resetSelectionStore();
  resetImageStore();
  dialogStore.close();
  dialogStore.closeSheet();
  mockedDownloadBlob.mockClear();
}

describe("resetAndCreateNewRack", () => {
  beforeEach(resetAll);

  it("resets the layout first, then creates a single fresh rack", () => {
    const layoutStore = getLayoutStore();
    // Seed a pre-existing rack so a reset that runs before create is observable:
    // if create ran without the reset, the layout would end up with two racks.
    const existing = layoutStore.addRack("Old Rack", 42);
    expect(existing).not.toBeNull();

    resetAndCreateNewRack();

    // The old rack is gone (reset) and exactly one new rack remains (create).
    // eslint-disable-next-line no-restricted-syntax -- reset-then-create invariant: exactly one rack must remain; a count of two would mean create ran without the preceding reset.
    expect(layoutStore.racks).toHaveLength(1);
    expect(layoutStore.racks.some((rack) => rack.id === existing?.id)).toBe(
      false,
    );
  });

  it("selects the freshly created rack and opens no dialog", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();

    resetAndCreateNewRack();

    const created = layoutStore.racks[0];
    expect(created).toBeDefined();
    expect(selectionStore.isRackSelected).toBe(true);
    expect(selectionStore.selectedRackId).toBe(created?.id);
    // The wizard was removed in #2747, so this path never opens a dialog.
    expect(dialogStore.openDialog).toBeNull();
  });
});

describe("handleExportSubmit filename source (#3007/R6c)", () => {
  beforeEach(resetAll);

  const csvOptions: ExportOptions = {
    format: "csv",
    scope: "all",
    includeNames: true,
    includeLegend: false,
    background: "solid",
  };

  it("the downloaded filename follows a rack rename, not the stale layout name", async () => {
    const layoutStore = getLayoutStore();
    const rack = layoutStore.addRack("Original Rack Name", 12);
    expect(rack).not.toBeNull();

    // Rename after creation: layout.name only syncs to a rack's name at
    // creation time (#1482), so this is the exact case that used to leave
    // the exported filename silently stuck on the old name.
    layoutStore.updateRack(rack!.id, { name: "Renamed Rack" });

    await handleExportSubmit(csvOptions);

    expect(mockedDownloadBlob).toHaveBeenCalledTimes(1);
    const [, filename] = mockedDownloadBlob.mock.calls[0]!;
    expect(filename).toMatch(/renamed-rack/i);
    expect(filename).not.toMatch(/original-rack-name/i);
  });

  it("falls back to the layout name when there is no rack to export", async () => {
    const layoutStore = getLayoutStore();
    layoutStore.setLayoutName("Fallback Layout Name");

    await handleExportSubmit(csvOptions);

    // No rack exists, so this hits the "No rack to export" guard: nothing
    // downloads. Confirms the rack-name source is additive, not a
    // replacement that breaks the zero-rack case.
    expect(mockedDownloadBlob).not.toHaveBeenCalled();
  });
});
