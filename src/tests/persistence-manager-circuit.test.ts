import { describe, it, expect, beforeEach } from "vitest";
import {
  handlePersistenceError,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { PersistenceError } from "$lib/storage/api";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";

/**
 * When the circuit breaker opens (3 consecutive offline failures), the toast
 * must not promise a manual retry it cannot deliver. Ctrl+S falls back to an
 * archive download while the API is unavailable, so the copy points at the
 * working recovery path (reload) instead. Regression guard for #2058/#2084.
 */
describe("circuit-breaker offline toast", () => {
  beforeEach(() => {
    resetToastStore();
    resetPersistenceManager();
    setApiAvailable(true);
  });

  it("does not promise a Ctrl+S retry once the circuit is open", () => {
    // Three consecutive 5xx failures trip the breaker.
    for (let i = 0; i < 3; i++) {
      handlePersistenceError(new PersistenceError("boom", 503), true);
    }

    const toast = getToastStore().toasts.at(-1);
    expect(toast?.duration).toBe(0); // persistent
    expect(toast?.message).not.toMatch(/Ctrl\+S/i);
    expect(toast?.message).toMatch(/working offline/i);
    expect(toast?.message).toMatch(/reload/i);
  });
});
