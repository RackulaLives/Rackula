import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";
import App from "../App.svelte";

vi.mock("$lib/utils/load-pipeline", () => ({
  loadFromApi: vi.fn(async () => true),
  loadFromFile: vi.fn(async () => true),
  finalizeLayoutLoad: vi.fn(),
}));
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
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
  hasEverConnectedToApi: vi.fn(() => true),
}));

const persistenceApiMocks = vi.hoisted(() => ({
  saveLayoutToServer: vi.fn(async () => "layout-1"),
  checkApiHealth: vi.fn(async () => true),
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

describe("App Start Screen integration", () => {
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
    shareMocks.decodeLayout.mockReturnValue(null);
    shareMocks.clearShareParam.mockReset();

    persistenceStoreMocks.initializePersistence.mockReset();
    persistenceStoreMocks.initializePersistence.mockResolvedValue(true);
    persistenceStoreMocks.isApiAvailable.mockReset();
    persistenceStoreMocks.isApiAvailable.mockReturnValue(true);

    persistenceApiMocks.listSavedLayouts.mockReset();
    persistenceApiMocks.listSavedLayouts.mockResolvedValue([]);
    persistenceApiMocks.loadSavedLayout.mockReset();

    sessionStorageMocks.loadSessionWithTimestamp.mockReset();
    sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue(null);
    sessionStorageMocks.clearSession.mockReset();
  });

  it("shows Start Screen on load when API is available and no share link", async () => {
    render(App);

    await waitFor(() => {
      expect(screen.getByTestId("start-screen")).toBeVisible();
    });

    expect(shareMocks.getShareParam).toHaveBeenCalledTimes(1);
    expect(shareMocks.decodeLayout).not.toHaveBeenCalled();
    expect(sessionStorageMocks.loadSessionWithTimestamp).toHaveBeenCalledTimes(
      1,
    );
    expect(persistenceStoreMocks.initializePersistence).toHaveBeenCalled();
  });

  it("skips server persistence calls when startup health check resolves unavailable", async () => {
    persistenceStoreMocks.initializePersistence.mockResolvedValue(false);
    persistenceStoreMocks.isApiAvailable.mockReturnValue(false);
    persistenceStoreMocks.getApiAvailableState.mockImplementationOnce(() => false);

    sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue({
      layout: createTestLayout({
        name: "Offline session",
        racks: [createTestRack({ id: "rack-offline", name: "Rack Offline" })],
      }),
      savedAt: new Date("2026-02-11T00:00:00.000Z").toISOString(),
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

  it("skips Start Screen when loading a share link", async () => {
    const sharedLayout = createTestLayout({
      name: "Shared Test",
      racks: [createTestRack({ id: "rack-1", name: "Rack 1" })],
    });

    shareMocks.getShareParam.mockReturnValue("encoded");
    shareMocks.decodeLayout.mockReturnValue(sharedLayout);

    render(App);

    await waitFor(() => {
      expect(shareMocks.decodeLayout).toHaveBeenCalledWith("encoded");
    });

    expect(screen.queryByTestId("start-screen")).not.toBeInTheDocument();
    expect(shareMocks.clearShareParam).toHaveBeenCalledTimes(1);
    expect(sessionStorageMocks.loadSessionWithTimestamp).not.toHaveBeenCalled();
  });
});
