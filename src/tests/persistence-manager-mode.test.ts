import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const loadPipelineMocks = vi.hoisted(() => ({
  loadFromFile: vi.fn(async () => true),
  loadFromApi: vi.fn(async () => true),
}));

vi.mock("$lib/storage/load-pipeline", () => ({
  loadFromFile: loadPipelineMocks.loadFromFile,
  loadFromApi: loadPipelineMocks.loadFromApi,
}));

const openFileTriggerMocks = vi.hoisted(() => ({
  runOpenFileFlow: vi.fn(),
}));

vi.mock("$lib/actions/open-file-trigger", () => ({
  runOpenFileFlow: openFileTriggerMocks.runOpenFileFlow,
  registerOpenFileTrigger: vi.fn(() => () => {}),
}));

// finalizeSuccessfulSave touches the working copy; stub it out.
vi.mock("$lib/storage/working-copy", () => ({
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

import {
  shouldSaveToServer,
  handleLoad,
  handlePersistenceError,
  getConsecutiveSaveFailures,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { PersistenceError } from "$lib/storage/api";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import * as layoutStoreModule from "$lib/stores/layout.svelte";

function setMode(mode: "browser" | "server"): void {
  window.__RACKULA_CONFIG__ = { storage: mode };
}

// handleLoad's replace-guard branch (#2987) reads changesSinceExport off the
// live layout store. Wrap the real store and override only that field, so the
// mock stays a complete, type-sound LayoutStore: any other field handleLoad
// might read returns the real value rather than silently being undefined.
// Mirrors the equivalent helper in dispatch.test.ts for new-layout. Tracked
// separately (not vi.restoreAllMocks) so restoring it in afterEach never
// touches the vi.hoisted loadFromFile/runOpenFileFlow mock implementations.
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

/**
 * The app's storage destination is decided by the explicit mode, not by probing.
 * Even with the API reachable, browser mode never saves to the server and load
 * uses the file picker. Locks issue #2037 AC (b).
 */
describe("storage-mode branching in the persistence manager", () => {
  const original = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    resetToastStore();
    resetPersistenceManager();
    dialogStore.close();
    loadPipelineMocks.loadFromFile.mockClear();
    loadPipelineMocks.loadFromApi.mockClear();
    openFileTriggerMocks.runOpenFileFlow.mockClear();
  });

  afterEach(() => {
    window.__RACKULA_CONFIG__ = original;
    layoutStoreSpy?.mockRestore();
    layoutStoreSpy = undefined;
  });

  it("shouldSaveToServer is false in browser mode even when the API is available", () => {
    setMode("browser");
    setApiAvailable(true);
    expect(shouldSaveToServer()).toBe(false);
  });

  it("shouldSaveToServer is true in server mode only when the API is available", () => {
    setMode("server");
    setApiAvailable(true);
    expect(shouldSaveToServer()).toBe(true);

    setApiAvailable(false);
    expect(shouldSaveToServer()).toBe(false);
  });

  it("handleLoad uses the file picker in browser mode", async () => {
    setMode("browser");
    setApiAvailable(true);
    await handleLoad();
    expect(loadPipelineMocks.loadFromFile).toHaveBeenCalledTimes(1);
    expect(dialogStore.isOpen("load")).toBe(false);
  });

  it("handleLoad opens the server load dialog in server mode", async () => {
    setMode("server");
    setApiAvailable(true);
    await handleLoad();
    expect(loadPipelineMocks.loadFromFile).not.toHaveBeenCalled();
    expect(dialogStore.isOpen("load")).toBe(true);
  });

  // Opening a file replaces the working copy. #2987: guard it behind a confirm
  // (mirrors restore-file / new-layout) when there are changes not yet in any
  // exported file; a fully backed-up copy still goes straight to the picker.
  it("handleLoad guards the file picker behind a confirm when there are unexported changes (#2987)", async () => {
    setMode("browser");
    setApiAvailable(true);
    stubChangesSinceExport(2);
    await handleLoad();
    expect(loadPipelineMocks.loadFromFile).not.toHaveBeenCalled();
    expect(openFileTriggerMocks.runOpenFileFlow).toHaveBeenCalledTimes(1);
  });

  it("handleLoad uses the file picker directly when there are no unexported changes (#2987)", async () => {
    setMode("browser");
    setApiAvailable(true);
    stubChangesSinceExport(0);
    await handleLoad();
    expect(loadPipelineMocks.loadFromFile).toHaveBeenCalledTimes(1);
    expect(openFileTriggerMocks.runOpenFileFlow).not.toHaveBeenCalled();
  });
});

/**
 * An expired Access session (HTTP 401) is not the same as a server being down.
 * It must surface a re-authenticate affordance, must not trip the offline
 * circuit breaker, and must not be retried as an offline failure. Locks #2037 AC (d).
 */
describe("auth (401) versus server-down (5xx) handling", () => {
  beforeEach(() => {
    resetToastStore();
    resetPersistenceManager();
    setMode("server");
    setApiAvailable(true);
  });

  it("does not trip the circuit breaker on repeated 401s", () => {
    for (let i = 0; i < 5; i++) {
      handlePersistenceError(new PersistenceError("Unauthorized", 401), true);
    }
    expect(getConsecutiveSaveFailures()).toBe(0);
  });

  it("surfaces a re-authenticate affordance, not an offline toast, on 401", () => {
    handlePersistenceError(new PersistenceError("Unauthorized", 401), true);
    const toast = getToastStore().toasts.at(-1);
    expect(toast?.message).toMatch(/re-?authenticate|sign in|session/i);
    expect(toast?.message).not.toMatch(/working offline/i);
  });

  it("still treats a 500 as a server-down failure that increments the counter", () => {
    handlePersistenceError(new PersistenceError("boom", 500), true);
    expect(getConsecutiveSaveFailures()).toBe(1);
    const toast = getToastStore().toasts.at(-1);
    expect(toast?.message).toMatch(/backend unavailable|working offline/i);
  });
});
