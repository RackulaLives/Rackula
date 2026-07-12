import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/svelte";
import App from "../App.svelte";

vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromApi: vi.fn(async () => true),
  loadFromFile: vi.fn(async () => true),
  finalizeLayoutLoad: vi.fn(),
}));

// #2988 fix-round finding: every OTHER committed test of the share-boot guard
// (App.startScreen.test.ts) mocks $lib/actions/open-file-trigger wholesale,
// which replaces BOTH runOpenFileFlow and registerOpenFileTrigger with fakes.
// That proves the App-level wiring calls runOpenFileFlow, but it can never
// catch a regression in the trigger's *registration timing* itself: if
// OpenFileGuardDialog's mount effect ever stopped registering before the
// deferred share flow calls runOpenFileFlow (or a future refactor broke the
// module-singleton handoff), every mocked test would stay green while the
// real app silently dropped the share payload with no dialog and no toast.
//
// This file intentionally does NOT mock $lib/actions/open-file-trigger, so
// App's real onMount talks to the real OpenFileGuardDialog (rendered inside
// App itself, see App.svelte) through the real module-level trigger. It
// mirrors LoadDialog.test.ts's "open-file replace guard (#2987)" describe
// block, which established the same real-module pattern for the Ctrl+O /
// LoadDialog entry points.
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetPlacementStore } from "$lib/stores/placement.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetToastStore, getToastStore } from "$lib/stores/toast.svelte";
import { resetViewportStore } from "$lib/utils/viewport.svelte";
import { createTestLayout, createTestRack } from "./factories";
import OpenFileGuardDialog from "$lib/components/OpenFileGuardDialog.svelte";
import {
  runOpenFileFlow,
  type OpenFileLoadAction,
} from "$lib/actions/open-file-trigger";
import * as layoutStoreModule from "$lib/stores/layout.svelte";

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

// Mirrors App.startScreen.test.ts's documented full-suite memory-pressure
// flake note (#1846): a generous per-suite timeout plus retry absorbs slow
// full-App renders under worker GC pressure; passes reliably in isolation.
describe(
  "App share-link guard, real trigger + real dialog (#2988 fix-round)",
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

    function primeDirtyShareBoot() {
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

      return { localLayout, sharedLayout };
    }

    it("actually shows the real OpenFileGuardDialog after restore, proving the trigger registered before the deferred share flow ran", async () => {
      primeDirtyShareBoot();

      render(App);

      // No mocked stand-in here: this is the real OpenFileGuardDialog mounted
      // as a sibling in App.svelte, wired through the real module-level
      // trigger in $lib/actions/open-file-trigger. If the trigger were
      // registered too late (or not at all) relative to the deferred
      // runOpenFileFlow(pendingShareLoad) call, runOpenFileFlow's contract is
      // to silently drop the load ("No-op ... if the dialog hasn't mounted
      // yet when dirty") -- this dialog text would never appear, and this
      // assertion would time out and fail.
      expect(
        await screen.findByText(/Replace this layout\?/i),
      ).toBeInTheDocument();

      // The restored local layout is real content behind the dialog (not the
      // pristine boot-time store), matching the deferred design.
      expect(getLayoutStore().layout.name).toBe("Local Work In Progress");
    });

    it("Replace loads the shared layout and fires the retained-copy toast", async () => {
      primeDirtyShareBoot();

      render(App);

      await screen.findByText(/Replace this layout\?/i);

      await fireEvent.click(screen.getByTestId("btn-replace-rack"));

      await waitFor(() => {
        expect(getLayoutStore().layout.name).toBe("Shared Test");
      });
      expect(
        await screen.findByText("Previous layout kept in Layouts"),
      ).toBeInTheDocument();
      // The dialog itself closes once resolved.
      expect(
        screen.queryByText(/Replace this layout\?/i),
      ).not.toBeInTheDocument();
    });

    it("Cancel keeps the restored local layout and never applies the shared one", async () => {
      primeDirtyShareBoot();

      render(App);

      await screen.findByText(/Replace this layout\?/i);

      await fireEvent.click(screen.getByTestId("btn-cancel-replace"));

      await waitFor(() => {
        expect(
          screen.queryByText(/Replace this layout\?/i),
        ).not.toBeInTheDocument();
      });
      expect(getLayoutStore().layout.name).toBe("Local Work In Progress");
      expect(screen.queryByText("Shared Test")).not.toBeInTheDocument();
    });

    it("loads a share link directly with no dialog when local storage has no unexported changes", async () => {
      const sharedLayout = createTestLayout({
        name: "Shared Test Clean",
        racks: [createTestRack({ id: "rack-1", name: "Rack 1" })],
      });
      shareMocks.getShareParam.mockReturnValue("encoded");
      shareMocks.decodeLayout.mockReturnValue({ layout: sharedLayout });

      render(App);

      await waitFor(() => {
        expect(getLayoutStore().layout.name).toBe("Shared Test Clean");
      });
      expect(
        screen.queryByText(/Replace this layout\?/i),
      ).not.toBeInTheDocument();
    });
  },
);

// The reviewer's narrow race (#2988 fix-round finding 1, independently
// flagged by two reviewers): the deferred share load's
// runOpenFileFlow(pendingShareLoad) call happens strictly after
// restoreLocalWorkspaceOrSession() resolves in App.svelte. But a competing
// guarded load (e.g. the user pressing Ctrl+O, or LoadDialog's own guarded
// paths, #2987) can register itself with the SAME real OpenFileGuardDialog
// first, if it fires anywhere in the window between the local store going
// dirty during restore (restoreLocalSession's layoutStore.markDirty(),
// App.svelte) and the share flow's own runOpenFileFlow call landing a tick
// or two later.
//
// Reproducing that exact "during the restore await" timing end-to-end
// through the full App would require pinning the test to the precise
// microtask/await shape of reconcileSession/applyReconcile in
// src/lib/storage/reconcile.ts (multiple internal awaits, one of which must
// resolve between the competing call and the share dispatch) - brittle,
// implementation-coupled, and liable to silently stop covering anything the
// moment that internal shape changes. Instead this test drives the same
// MECHANISM directly against the real trigger module and the real
// OpenFileGuardDialog (no App, no mocked storage layers), which is exactly
// what determines the outcome of the race regardless of how the two calls
// happen to get interleaved: two runOpenFileFlow calls land while dirty and
// no decision has been made yet. OpenFileGuardDialog now refuses the second
// registration outright (its `pendingLoad` slot is only ever set from empty)
// and surfaces a toast, so the first-registered load (the share load, here)
// is never lost and still runs when the user resolves the dialog.
describe("open-file guard refuses a competing load while one is pending (#2988 fix-round finding 1)", () => {
  let layoutStoreSpy: ReturnType<typeof vi.spyOn> | undefined;

  function stubChangesSinceExport(value: number) {
    const real = layoutStoreModule.getLayoutStore();
    const stub = new Proxy(real, {
      get(target, prop) {
        if (prop === "changesSinceExport") return value;
        return Reflect.get(target, prop, target);
      },
    });
    layoutStoreSpy = vi
      .spyOn(layoutStoreModule, "getLayoutStore")
      .mockReturnValue(stub);
  }

  afterEach(() => {
    layoutStoreSpy?.mockRestore();
    layoutStoreSpy = undefined;
    resetToastStore();
  });

  it("a second guarded load registered before the user decides is refused, with the first still running on Replace", async () => {
    stubChangesSinceExport(2);
    render(OpenFileGuardDialog);

    const shareLoad: OpenFileLoadAction = vi.fn();
    const competingLoad: OpenFileLoadAction = vi.fn();

    // The deferred share load registers first (mirrors App's pendingShareLoad
    // dispatch landing first in a race-free boot).
    runOpenFileFlow(shareLoad);
    await screen.findByText(/Replace this layout\?/i);

    // A competing guarded load (e.g. a Ctrl+O mid-boot) registers next, while
    // the user still has not acted on the dialog. It must be refused, not
    // swap in.
    runOpenFileFlow(competingLoad);

    expect(getToastStore().toasts.at(-1)?.message).toBe(
      "Finish the current open first",
    );
    // The dialog is still showing the FIRST load's confirm prompt; a clobber
    // would have silently kept it open too, so this alone can't distinguish
    // the two behaviours -- the resolution below is what proves it.
    expect(
      await screen.findByText(/Replace this layout\?/i),
    ).toBeInTheDocument();

    await fireEvent.click(screen.getByTestId("btn-replace-rack"));

    // The refusal preserved the first-registered load: Replace resolves the
    // share load, and the refused competing load never runs at all.
    expect(shareLoad).toHaveBeenCalledWith(true);
    expect(competingLoad).not.toHaveBeenCalled();
  });
});
