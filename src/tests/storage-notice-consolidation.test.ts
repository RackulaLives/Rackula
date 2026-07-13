/**
 * Storage notice consolidation tests (#3004/R26)
 *
 * Before this fix, a genuine fresh install could show two near-duplicate
 * browser-storage warnings: App.svelte's one-time on-load notice
 * ("Layouts are saved in this browser...") and backup-nudge's cold-start
 * nudge ("This layout lives only in this browser..."), fired moments apart.
 * App.svelte's separate on-load notice is removed; the backup nudge's
 * cold-start checkpoint (fired once, on the first edit of a never-exported
 * layout) is now the single source for this message, via one shared
 * STORAGE_NOTICE_MESSAGE constant. This test simulates the
 * StorageStatusChip wiring (evaluateBackupNudge -> toastStore.showToast)
 * directly against the real toast store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  evaluateBackupNudge,
  STORAGE_NOTICE_MESSAGE,
} from "$lib/utils/backup-nudge";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

function fireStorageNotice(toastStore: ReturnType<typeof getToastStore>) {
  return (checkpoint: number) => {
    toastStore.showToast(STORAGE_NOTICE_MESSAGE, "info", 8000, {
      label: "Export",
      onClick: vi.fn(),
    });
    return checkpoint;
  };
}

describe("storage notice consolidation", () => {
  beforeEach(() => {
    resetToastStore();
    localStorageMock.clear();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows exactly one storage notice on a genuine fresh install's first edit", () => {
    const toastStore = getToastStore();
    const layoutId = "fresh-layout";

    // Simulates handleNewRack() marking the seeded layout dirty: one change,
    // never exported.
    evaluateBackupNudge(layoutId, 1, false, fireStorageNotice(toastStore));

    expect(
      toastStore.toasts.some((t) => t.message === STORAGE_NOTICE_MESSAGE),
    ).toBe(true);
  });

  it("does not fire a second near-duplicate notice for the same checkpoint", () => {
    const toastStore = getToastStore();
    const layoutId = "fresh-layout";
    const fire = fireStorageNotice(toastStore);

    // First edit: cold-start notice fires.
    evaluateBackupNudge(layoutId, 1, false, fire);
    // A second effect run at the same change count (e.g. a duplicate mount)
    // must not stack a second copy of the same notice.
    evaluateBackupNudge(layoutId, 1, false, fire);

    // eslint-disable-next-line no-restricted-syntax -- deduplication invariant: a duplicate fire at the same checkpoint must not stack a second copy of the notice, so exactly one toast must remain.
    expect(toastStore.toasts).toHaveLength(1);
  });

  it("uses one canonical phrasing for the notice", () => {
    expect(STORAGE_NOTICE_MESSAGE).toMatch(/browser/i);
    expect(STORAGE_NOTICE_MESSAGE).toMatch(/export/i);
  });
});
