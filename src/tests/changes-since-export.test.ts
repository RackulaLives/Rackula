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
import { resetToastStore } from "$lib/stores/toast.svelte";
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

  it("exposes backup state through the storage chip data source", () => {
    const store = getLayoutStore();
    store.markDirty();
    const chip = getStorageChipState();
    expect(chip.changesSinceExport).toBe(1);
    expect(chip.hasEverExported).toBe(false);
    expect(chip.saveStatus).toBeDefined();
    expect(chip.consecutiveSaveFailures).toBe(0);
  });
});
