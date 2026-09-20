import { beforeEach, describe, expect, it } from "vitest";
import { createLayoutStore } from "$lib/stores/layout.svelte";
import { createHistoryStore } from "$lib/stores/history.svelte";
import {
  getLayoutDurability,
  setBrowserWriteFailures,
  resetBrowserWriteFailures,
} from "$lib/storage/durability.svelte";
import {
  clearStorageModeOverride,
  resetAvailabilityState,
} from "$lib/storage/availability.svelte";
import { createTestLayout } from "./factories";

/**
 * #3375 end-to-end wiring, the part unit tests of the pure formula cannot
 * reach: a persist that could not write a body must actually reach the chip.
 * The bug was that these two ends were never connected -- the persist knew, the
 * chip said "Saved" -- so the connection itself is what is worth testing.
 */

function layoutWithId(id: string, name: string) {
  return createTestLayout({ name, metadata: { id, name } });
}

describe("browser write failure reaches layout durability", () => {
  beforeEach(() => {
    resetBrowserWriteFailures();
    resetAvailabilityState();
    clearStorageModeOverride();
  });

  it("flips the layout out of Saved once its write is recorded as failed", () => {
    const store = createLayoutStore(createHistoryStore());
    store.loadLayout(layoutWithId("lay-1", "Homelab"));
    // Exported and unchanged: the state that used to report "Saved" while the
    // body had never reached localStorage.
    store.markExported();
    const durability = getLayoutDurability(store);
    expect(durability.status).toBe("saved");

    setBrowserWriteFailures(["lay-1"], "quota");

    expect(durability.status).toBe("error");
    expect(durability.shortLabel).not.toBe("Saved");
  });

  it("leaves a layout that did write alone", () => {
    const store = createLayoutStore(createHistoryStore());
    store.loadLayout(layoutWithId("lay-ok", "Fine"));
    store.markExported();

    setBrowserWriteFailures(["lay-other"], "quota");

    expect(getLayoutDurability(store).status).toBe("saved");
  });

  it("recovers when a later persist succeeds", () => {
    const store = createLayoutStore(createHistoryStore());
    store.loadLayout(layoutWithId("lay-1", "Homelab"));
    store.markExported();
    const durability = getLayoutDurability(store);

    setBrowserWriteFailures(["lay-1"], "quota");
    expect(durability.status).toBe("error");

    // The next pass attempted lay-1 and it succeeded, so the flag clears.
    setBrowserWriteFailures([], "quota", ["lay-1"]);
    expect(durability.status).toBe("saved");
  });

  // A pass that never tried this layout (paused by the twin-tab guard) is no
  // evidence the layout is safe, so its failure must survive.
  it("keeps the failure when a later pass did not attempt the layout", () => {
    const store = createLayoutStore(createHistoryStore());
    store.loadLayout(layoutWithId("lay-1", "Homelab"));
    store.markExported();
    const durability = getLayoutDurability(store);

    setBrowserWriteFailures(["lay-1"], "quota");
    expect(durability.status).toBe("error");

    setBrowserWriteFailures([], "quota", ["lay-other"]);
    expect(durability.status).toBe("error");
  });
});
