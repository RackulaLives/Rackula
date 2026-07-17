import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  handleSaveAsArchive,
  getStorageChipState,
} from "$lib/storage/manager.svelte";
import {
  saveSession,
  loadSessionWithTimestamp,
  clearSession,
} from "$lib/storage/working-copy";
import {
  saveLayoutBody,
  getLayoutSavedAt,
  loadWorkspaceIndex,
} from "$lib/storage/browser-workspace";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { downloadYamlFile } from "$lib/utils/archive";

vi.mock("$lib/utils/archive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/utils/archive")>();
  return { ...actual, downloadYamlFile: vi.fn() };
});

const mockedDownload = vi.mocked(downloadYamlFile);

describe("changesSinceExport", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    clearSession();
    vi.clearAllMocks();
  });

  it("increments on markDirty", () => {
    const store = getLayoutStore();
    expect(store.changesSinceExport).toBe(0);
    store.markDirty();
    store.markDirty();
    expect(store.changesSinceExport).toBe(2);
  });

  it("increments when a mutating action runs", () => {
    const store = getLayoutStore();
    store.addRack("Test Rack", 42);
    expect(store.changesSinceExport).toBeGreaterThan(0);
  });

  it("does not reset on markClean", () => {
    const store = getLayoutStore();
    store.markDirty();
    store.markClean();
    expect(store.isDirty).toBe(false);
    expect(store.changesSinceExport).toBe(1);
  });

  it("resets when a layout is loaded", () => {
    const store = getLayoutStore();
    store.markDirty();
    store.loadLayout(store.layout);
    expect(store.changesSinceExport).toBe(0);
  });

  it("persists through a session save/load round-trip", () => {
    const store = getLayoutStore();
    store.addRack("Test Rack", 42);
    store.markDirty();
    const counted = store.changesSinceExport;

    saveSession(store.layout, {
      changesSinceExport: store.changesSinceExport,
      hasEverExported: store.hasEverExported,
    });
    const restored = loadSessionWithTimestamp();

    expect(restored).not.toBeNull();
    expect(restored!.changesSinceExport).toBe(counted);
    expect(restored!.hasEverExported).toBe(false);
  });

  it("resets to 0 when a file export succeeds", async () => {
    mockedDownload.mockResolvedValue("layout.yaml");
    const store = getLayoutStore();
    store.markDirty();

    const saved = await handleSaveAsArchive();

    expect(saved).toBe(true);
    expect(store.changesSinceExport).toBe(0);
    expect(store.hasEverExported).toBe(true);
  });

  it("does not reset when the user cancels the save dialog", async () => {
    mockedDownload.mockRejectedValue(
      new DOMException("user cancelled", "AbortError"),
    );
    const store = getLayoutStore();
    store.markDirty();

    const saved = await handleSaveAsArchive();

    expect(saved).toBe(false);
    expect(store.changesSinceExport).toBe(1);
    expect(store.hasEverExported).toBe(false);
  });

  it("shows plain-language toast copy on a residual save failure, not the raw exception message (#2986)", async () => {
    mockedDownload.mockRejectedValue(
      new TypeError("Failed to execute 'showSaveFilePicker'"),
    );
    const store = getLayoutStore();
    store.markDirty();

    const saved = await handleSaveAsArchive();

    expect(saved).toBe(false);
    const toast = getToastStore().toasts.at(-1);
    expect(toast?.type).toBe("error");
    expect(toast?.message).not.toMatch(/showSaveFilePicker/);
    expect(toast?.message).toBe("Failed to save layout. Please try again.");
  });

  it("exposes backup state through the storage chip data source", () => {
    const store = getLayoutStore();
    store.markDirty();
    const chip = getStorageChipState();
    expect(chip.changesSinceExport).toBe(1);
    expect(chip.hasEverExported).toBe(false);
    expect(chip.saveStatus).toBeDefined();
    expect(chip.consecutiveSaveFailures).toBe(0);
  });

  it("stamps lastExportedAt on markExported and clears it on load", () => {
    const store = getLayoutStore();
    expect(store.lastExportedAt).toBeNull();

    store.markExported();
    expect(store.lastExportedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(store.lastExportedAt as string))).toBe(
      false,
    );

    store.loadLayout(store.layout);
    expect(store.lastExportedAt).toBeNull();
  });

  it("restores lastExportedAt through restoreBackupState", () => {
    const store = getLayoutStore();
    const stamp = "2026-06-26T12:00:00.000Z";
    store.restoreBackupState({
      changesSinceExport: 4,
      hasEverExported: true,
      lastExportedAt: stamp,
    });
    expect(store.lastExportedAt).toBe(stamp);
    expect(store.changesSinceExport).toBe(4);
    expect(store.hasEverExported).toBe(true);
  });

  it("persists and reads back lastExportedAt via the workspace library", () => {
    const id = "test-layout-id";
    const stamp = "2026-06-26T12:00:00.000Z";
    const layout = getLayoutStore().layout;

    saveLayoutBody(id, layout, {
      changesSinceExport: 2,
      hasEverExported: true,
      lastExportedAt: stamp,
    });

    const index = loadWorkspaceIndex();
    expect(index?.library[id]?.lastExportedAt).toBe(stamp);
    // updatedAt is the autosave write time, exposed for the "Auto-saved" line.
    expect(getLayoutSavedAt(id)).toBe(index?.library[id]?.updatedAt);
  });

  it("clears lastExportedAt when an explicit null is persisted (reset/load)", () => {
    const id = "clear-export-id";
    const layout = getLayoutStore().layout;

    saveLayoutBody(id, layout, {
      changesSinceExport: 0,
      hasEverExported: true,
      lastExportedAt: "2026-06-26T12:00:00.000Z",
    });
    expect(loadWorkspaceIndex()?.library[id]?.lastExportedAt).toBe(
      "2026-06-26T12:00:00.000Z",
    );

    // An explicit null (the store after a reset/load) must overwrite the prior
    // timestamp, not be coalesced back to it.
    saveLayoutBody(id, layout, {
      changesSinceExport: 0,
      hasEverExported: false,
      lastExportedAt: null,
    });
    expect(loadWorkspaceIndex()?.library[id]?.lastExportedAt).toBeNull();
  });
});
