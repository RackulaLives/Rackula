import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import TestPersistenceAutosave from "./helpers/TestPersistenceAutosave.svelte";
import { resetPersistenceManager } from "$lib/storage/manager.svelte";
import { saveLayoutToServer, type SaveLayoutResult } from "$lib/storage/api";
import { setServerBaseUpdatedAt } from "$lib/storage/server-base";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { resetImageStore } from "$lib/stores/images.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { createTestLayout } from "./factories";

vi.mock("$lib/storage/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/storage/api")>();
  return {
    ...actual,
    saveLayoutToServer: vi.fn(),
  };
});

/**
 * #2936: the server auto-save effect captured its schedule id as its very
 * first statement, before any of its early-return guards. A reactive rerun
 * triggered only by an availability flip (no new edit, so the rerun's guard
 * fails and it schedules no replacement save) still bumped the id. An
 * in-flight save's completion check then compared its captured id against the
 * bumped counter, saw a mismatch, and skipped markClean() even though the
 * save had actually reached the server. The chip stayed "Unsaved" until the
 * next edit or reconnect (self-healing, but a real staleness bug).
 */
describe("auto-save effect survives an availability flip mid-flight (#2936)", () => {
  const UUID = "22222222-2222-4222-8222-222222222222";
  const originalConfig = window.__RACKULA_CONFIG__;

  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    resetImageStore();
    resetPersistenceManager();
    setServerBaseUpdatedAt(null);
    window.__RACKULA_CONFIG__ = { storage: "server" };
    setApiAvailable(true);
    vi.mocked(saveLayoutToServer).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetImageStore();
    setServerBaseUpdatedAt(null);
    setApiAvailable(false);
    window.__RACKULA_CONFIG__ = originalConfig;
  });

  it("still clears dirty state when a save succeeds after availability flips mid-flight", async () => {
    const layoutStore = getLayoutStore();
    layoutStore.loadLayout(createTestLayout({ metadata: { id: UUID } }));
    layoutStore.markStarted();
    layoutStore.markDirty();

    let resolveSave: ((result: SaveLayoutResult) => void) | null = null;
    vi.mocked(saveLayoutToServer).mockImplementation(
      () =>
        new Promise<SaveLayoutResult>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const view = render(TestPersistenceAutosave);
    await tick();

    // Mount schedules the debounced server auto-save; fire it.
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveLayoutToServer).toHaveBeenCalledTimes(1);

    // Transient availability flip while the save is in flight: no edit
    // occurred, so the rerun's guard fails and no replacement save is
    // scheduled. This must not invalidate the in-flight save's completion.
    setApiAvailable(false);
    await tick();

    // The in-flight save now resolves successfully.
    resolveSave?.({ id: UUID, updatedAt: "2026-06-20T00:00:00.000Z" });
    await vi.waitFor(() => expect(layoutStore.isDirty).toBe(false));

    view.unmount();
  });
});
