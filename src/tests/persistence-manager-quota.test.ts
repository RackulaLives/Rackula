import { describe, it, expect, beforeEach } from "vitest";
import {
  handlePersistenceError,
  getConsecutiveSaveFailures,
  resetPersistenceManager,
} from "$lib/storage/manager.svelte";
import { PersistenceError } from "$lib/storage/api";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { setApiAvailable } from "$lib/storage/availability.svelte";

/**
 * Storage quota rejections (429 layout limit, 507 asset limit) come from a
 * reachable server with intact data, so they must surface as a recoverable
 * error with quota-specific messaging, not as offline. 507 in
 * particular must not fall through to the >= 500 offline branch.
 */
describe("handlePersistenceError quota rejections", () => {
  beforeEach(() => {
    resetToastStore();
    resetPersistenceManager();
    setApiAvailable(true);
  });

  it("treats 429 as a layout-quota error, not offline", () => {
    handlePersistenceError(
      new PersistenceError("Storage quota exceeded", 429),
      true,
    );
    const latest = getToastStore().toasts.at(-1);
    expect(latest?.type).toBe("error");
    expect(latest?.message).toContain("layout limit");
  });

  it("treats 507 as an asset-quota error without tripping the offline circuit breaker", () => {
    const failuresBefore = getConsecutiveSaveFailures();
    handlePersistenceError(
      new PersistenceError("Storage quota exceeded", 507),
      true,
    );
    const latest = getToastStore().toasts.at(-1);
    expect(latest?.type).toBe("error");
    expect(latest?.message).toContain("asset limit");
    // 507 must not be treated as offline, so the circuit breaker stays put.
    expect(getConsecutiveSaveFailures()).toBe(failuresBefore);
  });

  it("offers a retry action on quota errors when a retry handler is given", () => {
    let retried = false;
    handlePersistenceError(
      new PersistenceError("Storage quota exceeded", 429),
      true,
      () => {
        retried = true;
      },
    );
    const action = getToastStore().toasts.at(-1)?.action;
    expect(action?.label).toBe("Retry");
    action?.onClick();
    expect(retried).toBe(true);
  });

  it("does not mistake a rate-limit 429 for a storage quota", () => {
    // The API rate limiter also returns 429 but with a different error body.
    handlePersistenceError(
      new PersistenceError("Too Many Requests", 429),
      true,
    );
    const message = getToastStore().toasts.at(-1)?.message ?? "";
    expect(message).not.toContain("Storage full");
  });

  it("still routes genuine 5xx server errors to offline with persistent toast", () => {
    handlePersistenceError(new PersistenceError("boom", 503), true);
    const latest = getToastStore().toasts.at(-1);
    expect(latest?.type).toBe("error");
    expect(latest?.duration).toBe(0);
    // Distinguishes the offline branch from the generic "Save failed" else-branch.
    expect(latest?.message).toContain("backend unavailable");
  });
});
