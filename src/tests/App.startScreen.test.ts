import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import App from "../App.svelte";

vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromApi: vi.fn(async () => true),
  loadFromFile: vi.fn(async () => true),
  finalizeLayoutLoad: vi.fn(),
}));
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { createTestLayout, createTestRack } from "./factories";

const shareMocks = vi.hoisted(() => ({
  getShareParam: vi.fn<() => string | null>(() => null),
  clearShareParam: vi.fn(),
  decodeLayout: vi.fn(),
  generateShareUrl: vi.fn(() => null),
}));

const persistenceStoreMocks = vi.hoisted(() => ({
  initializePersistence: vi.fn(async () => true),
  isApiAvailable: vi.fn(() => true),
  setApiAvailable: vi.fn(),
  getApiAvailableState: vi.fn(() => true),
  getApiEverReached: vi.fn(() => true),
  getStorageMode: vi.fn(() => "server" as "browser" | "server"),
}));

const persistenceApiMocks = vi.hoisted(() => ({
  saveLayoutToServer: vi.fn(async () => "layout-1"),
  checkApiHealth: vi.fn(async () => true),
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
  getApiEverReached: persistenceStoreMocks.getApiEverReached,
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

// Full-App renders flake under full-suite memory pressure: the worker GC-thrashes
// and a render + waitFor can exceed the default 10s ("Test timed out"). A generous
// per-suite timeout absorbs the slow renders, and retry covers residual transient
// failures. The tests pass in isolation. See issue #1846 (and the matching note in
// App.cleanupPrompt.test.ts).
describe("App entry (StartScreen removed, #2081)", { retry: 2, timeout: 30000 }, () => {
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

    shareMocks.getShareParam.mockReset();
    shareMocks.getShareParam.mockReturnValue(null);
    shareMocks.decodeLayout.mockReset();
    shareMocks.decodeLayout.mockReturnValue({ layout: null });
    shareMocks.clearShareParam.mockReset();

    persistenceStoreMocks.initializePersistence.mockReset();
    persistenceStoreMocks.initializePersistence.mockResolvedValue(true);
    persistenceStoreMocks.isApiAvailable.mockReset();
    persistenceStoreMocks.isApiAvailable.mockReturnValue(true);
    persistenceStoreMocks.getApiEverReached.mockReset();
    persistenceStoreMocks.getApiEverReached.mockReturnValue(true);
    persistenceStoreMocks.getStorageMode.mockReset();
    persistenceStoreMocks.getStorageMode.mockReturnValue("server");

    persistenceApiMocks.listSavedLayouts.mockReset();
    persistenceApiMocks.listSavedLayouts.mockResolvedValue([]);
    persistenceApiMocks.loadSavedLayout.mockReset();

    sessionStorageMocks.loadSessionWithTimestamp.mockReset();
    sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue(null);
    sessionStorageMocks.clearSession.mockReset();
    sessionStorageMocks.detectModeFlip.mockReset();
    sessionStorageMocks.detectModeFlip.mockReturnValue("none");
  });

  it("opens straight to the canvas with no StartScreen on a fresh launch", async () => {
    render(App);

    // The app boots past initialization without rendering any StartScreen modal.
    await waitFor(() => {
      expect(persistenceStoreMocks.initializePersistence).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("start-screen")).not.toBeInTheDocument();
    // A fresh launch has no layout, so the canvas shows its empty state and the
    // user reaches new/open/import through the sidebar and app menu.
    expect(getLayoutStore().rackCount).toBe(0);
  });

  it("skips initialization-driven entry when loading a share link", async () => {
    const sharedLayout = createTestLayout({
      name: "Shared Test",
      racks: [createTestRack({ id: "rack-1", name: "Rack 1" })],
    });

    shareMocks.getShareParam.mockReturnValue("encoded");
    shareMocks.decodeLayout.mockReturnValue({ layout: sharedLayout });

    render(App);

    await waitFor(() => {
      expect(shareMocks.decodeLayout).toHaveBeenCalledWith("encoded");
    });

    expect(screen.queryByTestId("start-screen")).not.toBeInTheDocument();
    expect(shareMocks.clearShareParam).toHaveBeenCalledTimes(1);
    expect(sessionStorageMocks.loadSessionWithTimestamp).not.toHaveBeenCalled();
  });

  it("skips server persistence calls when startup health check resolves unavailable", async () => {
    persistenceStoreMocks.initializePersistence.mockResolvedValue(false);
    persistenceStoreMocks.isApiAvailable.mockReturnValue(false);
    persistenceStoreMocks.getApiAvailableState.mockImplementationOnce(
      () => false,
    );

    sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue({
      layout: createTestLayout({
        name: "Offline session",
        racks: [createTestRack({ id: "rack-offline", name: "Rack Offline" })],
      }),
      savedAt: new Date("2026-02-11T00:00:00.000Z").toISOString(),
      changesSinceExport: 0,
      hasEverExported: false,
      storageMode: "server",
    });

    render(App);

    await waitFor(() => {
      expect(persistenceStoreMocks.initializePersistence).toHaveBeenCalledTimes(
        1,
      );
    });

    expect(persistenceApiMocks.listSavedLayouts).not.toHaveBeenCalled();
    expect(persistenceApiMocks.saveLayoutToServer).not.toHaveBeenCalled();
  });
});
