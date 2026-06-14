import { describe, it, expect, beforeEach } from "vitest";
import {
  finalizeSuccessfulSave,
  handlePersistenceError,
  getConsecutiveSaveFailures,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { PersistenceError } from "$lib/storage/api";
import {
  getServerBaseUpdatedAt,
  setServerBaseUpdatedAt,
} from "$lib/storage/server-base";
import { loadSessionWithTimestamp } from "$lib/storage/working-copy";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";
import { createTestLayout } from "./factories";

/**
 * A successful server save must leave the layout clean regardless of which
 * path performed it. The debounced auto-save and the manual save share
 * finalizeSuccessfulSave, so a successful auto-save matches a manual one:
 * dirty cleared, failure counter reset, lingering error toast dismissed.
 * A failed save must NOT clear the dirty flag. Regression guard for #2057.
 */
describe("successful save epilogue", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetToastStore();
    resetPersistenceManager();
    setServerBaseUpdatedAt(null);
    setApiAvailable(true);
  });

  it("clears the dirty flag on save success", () => {
    const layoutStore = getLayoutStore();
    layoutStore.markDirty();
    expect(layoutStore.isDirty).toBe(true);

    finalizeSuccessfulSave();

    expect(layoutStore.isDirty).toBe(false);
  });

  it("resets the consecutive-failure counter and dismisses the error toast", () => {
    // Two failures leave a counter and a lingering error toast behind.
    handlePersistenceError(new PersistenceError("boom", 503), true);
    handlePersistenceError(new PersistenceError("boom", 503), true);
    expect(getConsecutiveSaveFailures()).toBeGreaterThan(0);
    const errorToast = getToastStore().toasts.at(-1);
    expect(errorToast).toBeDefined();

    finalizeSuccessfulSave();

    expect(getConsecutiveSaveFailures()).toBe(0);
    expect(
      getToastStore().toasts.some((t) => t.id === errorToast?.id),
    ).toBe(false);
  });

  it("leaves the layout dirty when a save fails", () => {
    const layoutStore = getLayoutStore();
    layoutStore.markDirty();

    handlePersistenceError(new PersistenceError("boom", 503), true);

    expect(layoutStore.isDirty).toBe(true);
  });

  it("records server health but preserves dirty state on a stale save", () => {
    const layoutStore = getLayoutStore();
    // A prior failure leaves a counter and error toast behind.
    handlePersistenceError(new PersistenceError("boom", 503), true);
    layoutStore.markDirty();

    // Stale completion: the save succeeded, but newer edits arrived in flight.
    finalizeSuccessfulSave(false);

    expect(getConsecutiveSaveFailures()).toBe(0); // server health recorded
    expect(layoutStore.isDirty).toBe(true); // newer unsaved edits preserved
  });

  it("keeps the working copy and records the server echo on a durable save", () => {
    const layoutStore = getLayoutStore();
    // A started layout with a rack: the conditions under which the working copy
    // is autosaved and a server PUT is echoed back.
    layoutStore.loadLayout(createTestLayout());
    layoutStore.markStarted();
    layoutStore.markDirty();
    expect(layoutStore.hasRack).toBe(true);

    finalizeSuccessfulSave(true, "2026-06-14T10:00:00.000Z");

    // The echo becomes the new base for subsequent PUTs.
    expect(getServerBaseUpdatedAt()).toBe("2026-06-14T10:00:00.000Z");
    // The working copy is re-stamped, not removed: it survives a reload and
    // carries the echo so divergence can be detected next session.
    const session = loadSessionWithTimestamp();
    expect(session).not.toBeNull();
    expect(session?.serverUpdatedAt).toBe("2026-06-14T10:00:00.000Z");
  });
});
