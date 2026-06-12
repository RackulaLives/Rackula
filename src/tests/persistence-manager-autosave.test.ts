import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  finalizeSuccessfulSave,
  handlePersistenceError,
  getConsecutiveSaveFailures,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { PersistenceError } from "$lib/storage/api";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";

// Avoid touching localStorage; finalizeSuccessfulSave clears the working copy.
vi.mock("$lib/storage/working-copy", () => ({
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

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
});
