import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import App from "../App.svelte";

vi.mock("$lib/utils/load-pipeline", () => ({
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
  hasEverConnectedToApi: vi.fn(() => false),
}));

const persistenceApiMocks = vi.hoisted(() => ({
  saveLayoutToServer: vi.fn(async () => "layout-1"),
  checkApiHealth: vi.fn(async () => false),
  listSavedLayouts: vi.fn(async () => []),
  loadSavedLayout: vi.fn(),
  deleteSavedLayout: vi.fn(async () => undefined),
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
}));

const archiveMocks = vi.hoisted(() => ({
  downloadArchive: vi.fn(async () => undefined),
  generateArchiveFilename: vi.fn(() => "cleanup-test.Rackula.zip"),
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

vi.mock("$lib/stores/persistence.svelte", () => ({
  initializePersistence: persistenceStoreMocks.initializePersistence,
  isApiAvailable: persistenceStoreMocks.isApiAvailable,
  setApiAvailable: persistenceStoreMocks.setApiAvailable,
  getApiAvailableState: persistenceStoreMocks.getApiAvailableState,
  hasEverConnectedToApi: persistenceStoreMocks.hasEverConnectedToApi,
}));

vi.mock("$lib/utils/persistence-api", () => ({
  saveLayoutToServer: persistenceApiMocks.saveLayoutToServer,
  checkApiHealth: persistenceApiMocks.checkApiHealth,
  listSavedLayouts: persistenceApiMocks.listSavedLayouts,
  loadSavedLayout: persistenceApiMocks.loadSavedLayout,
  deleteSavedLayout: persistenceApiMocks.deleteSavedLayout,
  PersistenceError: persistenceApiMocks.PersistenceError,
}));

vi.mock("$lib/utils/session-storage", () => ({
  saveSession: sessionStorageMocks.saveSession,
  loadSessionWithTimestamp: sessionStorageMocks.loadSessionWithTimestamp,
  clearSession: sessionStorageMocks.clearSession,
  isServerNewer: sessionStorageMocks.isServerNewer,
}));

vi.mock("$lib/utils/archive", async () => {
  const actual =
    await vi.importActual<typeof import("$lib/utils/archive")>(
      "$lib/utils/archive",
    );
  return {
    ...actual,
    downloadArchive: archiveMocks.downloadArchive,
    generateArchiveFilename: archiveMocks.generateArchiveFilename,
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
  persistenceStoreMocks.hasEverConnectedToApi.mockReset();
  persistenceStoreMocks.hasEverConnectedToApi.mockReturnValue(false);

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

  archiveMocks.downloadArchive.mockReset();
  archiveMocks.downloadArchive.mockResolvedValue(undefined);
  archiveMocks.generateArchiveFilename.mockReset();
  archiveMocks.generateArchiveFilename.mockReturnValue(
    "cleanup-test.Rackula.zip",
  );
  archiveMocks.extractFolderArchive.mockReset();
}

describe("App cleanup prompt flow", () => {
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
    expect(archiveMocks.downloadArchive).not.toHaveBeenCalled();

    await fireEvent.click(
      screen.getByRole("button", { name: /Delete Selected/ }),
    );

    await waitFor(() => {
      expect(archiveMocks.downloadArchive).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps Keep All distinct by proceeding directly without opening cleanup dialog", async () => {
    openCleanupPrompt("save");
    render(App);

    await fireEvent.click(
      await screen.findByRole("button", { name: "Keep All" }),
    );

    await waitFor(() => {
      expect(archiveMocks.downloadArchive).toHaveBeenCalledTimes(1);
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
    expect(archiveMocks.downloadArchive).not.toHaveBeenCalled();
  });

  it("persists Don't ask again when checked before continuing", async () => {
    openCleanupPrompt("save");
    render(App);

    await fireEvent.click(await screen.findByLabelText("Don't ask again"));
    await fireEvent.click(screen.getByRole("button", { name: "Keep All" }));

    await waitFor(() => {
      expect(archiveMocks.downloadArchive).toHaveBeenCalledTimes(1);
    });
    expect(uiStore.promptCleanupOnSave).toBe(false);
  });
});
