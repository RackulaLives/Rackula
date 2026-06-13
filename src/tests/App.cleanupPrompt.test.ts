import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import App from "../App.svelte";

vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromApi: vi.fn(async () => true),
  loadFromFile: vi.fn(async () => true),
  finalizeLayoutLoad: vi.fn(),
}));
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { createTestDeviceType, createTestLayout } from "./factories";

const shareMocks = vi.hoisted(() => ({
  getShareParam: vi.fn<() => string | null>(() => null),
  clearShareParam: vi.fn(),
  decodeLayout: vi.fn(),
  generateShareUrl: vi.fn(() => null),
}));

const persistenceStoreMocks = vi.hoisted(() => ({
  initializePersistence: vi.fn(async () => false),
  isApiAvailable: vi.fn(() => false),
  setApiAvailable: vi.fn(),
  getApiAvailableState: vi.fn(() => false),
  getStorageMode: vi.fn(() => "server" as "browser" | "server"),
}));

const persistenceApiMocks = vi.hoisted(() => ({
  saveLayoutToServer: vi.fn(async () => "layout-1"),
  checkApiHealth: vi.fn(async () => false),
  listSavedLayouts: vi.fn(async () => []),
  loadSavedLayout: vi.fn(),
  deleteSavedLayout: vi.fn(async () => undefined),
  getServerInstanceLabel: vi.fn(() => "test-host"),
  PersistenceError: class PersistenceError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.name = "PersistenceError";
      this.statusCode = statusCode;
    }
  },
}));

const sessionStorageMocks = vi.hoisted(() => ({
  saveSession: vi.fn(),
  loadSessionWithTimestamp: vi.fn(() => null),
  clearSession: vi.fn(),
  isServerNewer: vi.fn(() => false),
  detectModeFlip: vi.fn(() => "none" as "none" | "server-to-browser" | "browser-to-server"),
}));

const archiveMocks = vi.hoisted(() => ({
  downloadYamlFile: vi.fn(async () => "cleanup-test.rackula.yaml"),
  extractFolderArchive: vi.fn(),
}));

vi.mock("$lib/utils/share", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/utils/share")>(
      "$lib/utils/share",
    );
  return {
    ...actual,
    getShareParam: shareMocks.getShareParam,
    clearShareParam: shareMocks.clearShareParam,
    decodeLayout: shareMocks.decodeLayout,
    generateShareUrl: shareMocks.generateShareUrl,
  };
});

vi.mock("$lib/storage/availability.svelte", () => ({
  initializePersistence: persistenceStoreMocks.initializePersistence,
  isApiAvailable: persistenceStoreMocks.isApiAvailable,
  setApiAvailable: persistenceStoreMocks.setApiAvailable,
  getApiAvailableState: persistenceStoreMocks.getApiAvailableState,
  getStorageMode: persistenceStoreMocks.getStorageMode,
}));

vi.mock("$lib/storage/api", () => ({
  saveLayoutToServer: persistenceApiMocks.saveLayoutToServer,
  checkApiHealth: persistenceApiMocks.checkApiHealth,
  listSavedLayouts: persistenceApiMocks.listSavedLayouts,
  loadSavedLayout: persistenceApiMocks.loadSavedLayout,
  deleteSavedLayout: persistenceApiMocks.deleteSavedLayout,
  getServerInstanceLabel: persistenceApiMocks.getServerInstanceLabel,
  PersistenceError: persistenceApiMocks.PersistenceError,
}));

vi.mock("$lib/storage/working-copy", () => ({
  saveSession: sessionStorageMocks.saveSession,
  loadSessionWithTimestamp: sessionStorageMocks.loadSessionWithTimestamp,
  clearSession: sessionStorageMocks.clearSession,
  isServerNewer: sessionStorageMocks.isServerNewer,
  detectModeFlip: sessionStorageMocks.detectModeFlip,
}));

vi.mock("$lib/utils/archive", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/utils/archive")>(
      "$lib/utils/archive",
    );
  return {
    ...actual,
    downloadYamlFile: archiveMocks.downloadYamlFile,
    extractFolderArchive: archiveMocks.extractFolderArchive,
  };
});

function openCleanupPrompt(operation: "save" | "export"): void {
  dialogStore.pendingCleanupOperation = operation;
  dialogStore.open("cleanupPrompt");
}

function resetHoistedMocks(): void {
  shareMocks.getShareParam.mockReset();
  shareMocks.getShareParam.mockReturnValue(null);
  shareMocks.clearShareParam.mockReset();
  shareMocks.decodeLayout.mockReset();
  shareMocks.decodeLayout.mockReturnValue({ layout: null });
  shareMocks.generateShareUrl.mockReset();
  shareMocks.generateShareUrl.mockReturnValue(null);

  persistenceStoreMocks.initializePersistence.mockReset();
  persistenceStoreMocks.initializePersistence.mockResolvedValue(false);
  persistenceStoreMocks.isApiAvailable.mockReset();
  persistenceStoreMocks.isApiAvailable.mockReturnValue(false);
  persistenceStoreMocks.setApiAvailable.mockReset();
  persistenceStoreMocks.getApiAvailableState.mockReset();
  persistenceStoreMocks.getApiAvailableState.mockReturnValue(false);
  persistenceStoreMocks.getStorageMode.mockReset();
  persistenceStoreMocks.getStorageMode.mockReturnValue("server");

  persistenceApiMocks.saveLayoutToServer.mockReset();
  persistenceApiMocks.saveLayoutToServer.mockResolvedValue("layout-1");
  persistenceApiMocks.checkApiHealth.mockReset();
  persistenceApiMocks.checkApiHealth.mockResolvedValue(false);
  persistenceApiMocks.listSavedLayouts.mockReset();
  persistenceApiMocks.listSavedLayouts.mockResolvedValue([]);
  persistenceApiMocks.loadSavedLayout.mockReset();
  persistenceApiMocks.deleteSavedLayout.mockReset();
  persistenceApiMocks.deleteSavedLayout.mockResolvedValue(undefined);

  sessionStorageMocks.saveSession.mockReset();
  sessionStorageMocks.loadSessionWithTimestamp.mockReset();
  sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue(null);
  sessionStorageMocks.clearSession.mockReset();
  sessionStorageMocks.isServerNewer.mockReset();
  sessionStorageMocks.isServerNewer.mockReturnValue(false);
  sessionStorageMocks.detectModeFlip.mockReset();
  sessionStorageMocks.detectModeFlip.mockReturnValue("none");

  archiveMocks.downloadYamlFile.mockReset();
  archiveMocks.downloadYamlFile.mockResolvedValue("cleanup-test.rackula.yaml");
  archiveMocks.extractFolderArchive.mockReset();
}

// These suites render the full App component. Under full-suite memory pressure
// the worker GC-thrashes, so a render + waitFor can exceed the default 10s and
// the test fails with "Test timed out". A generous per-suite timeout absorbs the
// slow renders, and retry covers any residual transient failures. The tests pass
// in isolation; the failing test varies run to run. See issue #1846.
describe("App cleanup prompt flow", { retry: 2, timeout: 30000 }, () => {
  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();

  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetUIStore();
    resetCanvasStore();
    resetPlacementStore();
    resetImageStore();
    resetHistoryStore();
    resetToastStore();
    resetViewportStore();
    dialogStore.close();
    dialogStore.closeSheet();
    resetHoistedMocks();

    const layoutWithUnusedType = createTestLayout({
      name: "Cleanup Prompt Test Layout",
      device_types: [
        createTestDeviceType({
          slug: "unused-cleanup-type",
          model: "Unused Cleanup Type",
          category: "server",
        }),
      ],
    });
    layoutStore.loadLayout(layoutWithUnusedType);

    sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue({
      layout: layoutWithUnusedType,
      savedAt: new Date("2026-02-09T00:00:00.000Z").toISOString(),
      changesSinceExport: 0,
      hasEverExported: false,
      storageMode: "server",
    });
  });

  it("routes Review & Clean Up into cleanup workflow and then saves after deletion", async () => {
    openCleanupPrompt("save");
    render(App);

    await fireEvent.click(
      await screen.findByRole("button", { name: "Review & Clean Up" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Clean Up Device Library" }),
    ).toBeInTheDocument();
    expect(archiveMocks.downloadYamlFile).not.toHaveBeenCalled();

    await fireEvent.click(
      screen.getByRole("button", { name: /Delete Selected/ }),
    );

    await waitFor(() => {
      expect(archiveMocks.downloadYamlFile).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps Keep All distinct by proceeding directly without opening cleanup dialog", async () => {
    openCleanupPrompt("save");
    render(App);

    await fireEvent.click(
      await screen.findByRole("button", { name: "Keep All" }),
    );

    await waitFor(() => {
      expect(archiveMocks.downloadYamlFile).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole("dialog", { name: "Clean Up Device Library" }),
    ).not.toBeInTheDocument();
  });

  it("continues to export flow when Keep All is chosen for export", async () => {
    openCleanupPrompt("export");
    render(App);

    await fireEvent.click(
      await screen.findByRole("button", { name: "Keep All" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Export" }),
    ).toBeInTheDocument();
    expect(archiveMocks.downloadYamlFile).not.toHaveBeenCalled();
  });

  it("persists Don't ask again when checked before continuing", async () => {
    openCleanupPrompt("save");
    render(App);

    await fireEvent.click(await screen.findByLabelText("Don't ask again"));
    await fireEvent.click(screen.getByRole("button", { name: "Keep All" }));

    await waitFor(() => {
      expect(archiveMocks.downloadYamlFile).toHaveBeenCalledTimes(1);
    });
    expect(uiStore.promptCleanupOnSave).toBe(false);
  });
});
