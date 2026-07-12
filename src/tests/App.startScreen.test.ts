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
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { createTestLayout, createTestRack } from "./factories";

const shareMocks = vi.hoisted(() => ({
  getShareParam: vi.fn<() => string | null>(() => null),
  clearShareParam: vi.fn(),
  decodeLayout: vi.fn(),
  generateShareUrl: vi.fn(() => null),
}));

// The share-link guard (#2988) defers a dirty share load to runOpenFileFlow,
// the same open-file replace-confirm mechanism #2987 built for Ctrl+O. Mock
// it here to assert the App-level wiring (guard invoked / not invoked) without
// re-testing the guard's own dirty/clean branching, already covered directly
// in open-file-trigger.test.ts.
const openFileTriggerMocks = vi.hoisted(() => ({
  runOpenFileFlow: vi.fn<(loadAction: (guarded: boolean) => unknown) => void>(
    () => {},
  ),
}));

vi.mock("$lib/actions/open-file-trigger", () => ({
  runOpenFileFlow: openFileTriggerMocks.runOpenFileFlow,
  registerOpenFileTrigger: vi.fn(() => () => {}),
}));

const persistenceStoreMocks = vi.hoisted(() => ({
  initializePersistence: vi.fn(async () => true),
  isApiAvailable: vi.fn(() => true),
  setApiAvailable: vi.fn(),
  getApiAvailableState: vi.fn(() => true),
  getApiEverReached: vi.fn(() => true),
  getStorageMode: vi.fn(() => "server" as "browser" | "server"),
  isServerReachableInBrowser: vi.fn(() => false),
  isStorageModeFromOverride: vi.fn(() => false),
  clearStorageModeOverride: vi.fn(),
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
  detectModeFlip: vi.fn(
    () => "none" as "none" | "server-to-browser" | "browser-to-server",
  ),
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
  isServerReachableInBrowser: persistenceStoreMocks.isServerReachableInBrowser,
  isStorageModeFromOverride: persistenceStoreMocks.isStorageModeFromOverride,
  clearStorageModeOverride: persistenceStoreMocks.clearStorageModeOverride,
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
describe(
  "App entry (StartScreen removed, #2081)",
  { retry: 2, timeout: 30000 },
  () => {
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
      openFileTriggerMocks.runOpenFileFlow.mockReset();

      persistenceStoreMocks.initializePersistence.mockReset();
      persistenceStoreMocks.initializePersistence.mockResolvedValue(true);
      persistenceStoreMocks.isApiAvailable.mockReset();
      persistenceStoreMocks.isApiAvailable.mockReturnValue(true);
      persistenceStoreMocks.getApiEverReached.mockReset();
      persistenceStoreMocks.getApiEverReached.mockReturnValue(true);
      persistenceStoreMocks.getStorageMode.mockReset();
      persistenceStoreMocks.getStorageMode.mockReturnValue("server");
      persistenceStoreMocks.isServerReachableInBrowser.mockReset();
      persistenceStoreMocks.isServerReachableInBrowser.mockReturnValue(false);
      persistenceStoreMocks.isStorageModeFromOverride.mockReset();
      persistenceStoreMocks.isStorageModeFromOverride.mockReturnValue(false);
      persistenceStoreMocks.clearStorageModeOverride.mockReset();

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

    it("loads a share link directly when local storage has no unexported changes", async () => {
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
      // The #2988 dirty pre-check does read the local session, but finding it
      // clean (the default mock return) skips the rest of server-mode
      // restore/reconcile entirely, same as before the fix.
      expect(sessionStorageMocks.loadSessionWithTimestamp).toHaveBeenCalled();
      expect(persistenceApiMocks.listSavedLayouts).not.toHaveBeenCalled();
      expect(openFileTriggerMocks.runOpenFileFlow).not.toHaveBeenCalled();
      expect(getLayoutStore().layout.name).toBe("Shared Test");
    });

    // R3/#2988: a share link must not silently replace unexported local work.
    it("guards a share link behind the open-file confirm flow when local storage has unexported changes", async () => {
      const localLayout = createTestLayout({
        name: "Local Work In Progress",
        racks: [createTestRack({ id: "rack-local", name: "Local Rack" })],
      });
      const sharedLayout = createTestLayout({
        name: "Shared Test",
        racks: [createTestRack({ id: "rack-1", name: "Rack 1" })],
      });

      sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue({
        layout: localLayout,
        savedAt: new Date("2026-07-11T00:00:00.000Z").toISOString(),
        changesSinceExport: 2,
        hasEverExported: false,
        storageMode: "server",
      });
      shareMocks.getShareParam.mockReturnValue("encoded");
      shareMocks.decodeLayout.mockReturnValue({ layout: sharedLayout });

      render(App);

      await waitFor(() => {
        expect(openFileTriggerMocks.runOpenFileFlow).toHaveBeenCalledTimes(1);
      });

      // The URL payload is dropped immediately regardless of the eventual
      // choice, and the local session is restored (real content for "Export
      // first" to protect) while the shared layout is withheld pending the
      // guard's outcome.
      expect(shareMocks.clearShareParam).toHaveBeenCalledTimes(1);
      expect(getLayoutStore().layout.name).toBe("Local Work In Progress");

      // Simulate the user confirming "Replace" in OpenFileGuardDialog.
      const loadAction = openFileTriggerMocks.runOpenFileFlow.mock.calls[0]![0];
      await loadAction(true);

      expect(getLayoutStore().layout.name).toBe("Shared Test");
      expect(getToastStore().toasts.at(-1)?.message).toBe(
        "Previous layout kept in Layouts",
      );
    });

    // A Cancelled guard must never apply the deferred share load.
    it("keeps the restored local layout when the share-link guard is cancelled", async () => {
      const localLayout = createTestLayout({
        name: "Local Work In Progress",
        racks: [createTestRack({ id: "rack-local", name: "Local Rack" })],
      });
      const sharedLayout = createTestLayout({
        name: "Shared Test",
        racks: [createTestRack({ id: "rack-1", name: "Rack 1" })],
      });

      sessionStorageMocks.loadSessionWithTimestamp.mockReturnValue({
        layout: localLayout,
        savedAt: new Date("2026-07-11T00:00:00.000Z").toISOString(),
        changesSinceExport: 2,
        hasEverExported: false,
        storageMode: "server",
      });
      shareMocks.getShareParam.mockReturnValue("encoded");
      shareMocks.decodeLayout.mockReturnValue({ layout: sharedLayout });

      render(App);

      await waitFor(() => {
        expect(openFileTriggerMocks.runOpenFileFlow).toHaveBeenCalledTimes(1);
      });

      // OpenFileGuardDialog's Cancel handler simply never calls the deferred
      // load action; nothing further to simulate here.
      expect(getLayoutStore().layout.name).toBe("Local Work In Progress");
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
        expect(
          persistenceStoreMocks.initializePersistence,
        ).toHaveBeenCalledTimes(1);
      });

      expect(persistenceApiMocks.listSavedLayouts).not.toHaveBeenCalled();
      expect(persistenceApiMocks.saveLayoutToServer).not.toHaveBeenCalled();
    });
  },
);
