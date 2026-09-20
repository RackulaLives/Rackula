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
import type { Layout } from "$lib/types";

/**
 * #3375 end-to-end wiring, the part unit tests of the pure formula cannot
 * reach: a persist that could not write a body must actually reach the chip.
 * The bug was that these two ends were never connected -- the persist knew, the
 * chip said "Saved" -- so the connection itself is what is worth testing.
 */

function layoutWithId(id: string, name: string): Layout {
  return {
    version: "1.0",
    name,
    racks: [],
    device_types: [],
    settings: { display_mode: "label", show_labels_on_images: false },
    metadata: { id, name, schema_version: "1.0" },
  } as unknown as Layout;
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

    setBrowserWriteFailures(["lay-1"]);

    expect(durability.status).toBe("error");
    expect(durability.shortLabel).not.toBe("Saved");
  });

  it("leaves a layout that did write alone", () => {
    const store = createLayoutStore(createHistoryStore());
    store.loadLayout(layoutWithId("lay-ok", "Fine"));
    store.markExported();

    setBrowserWriteFailures(["lay-other"]);

    expect(getLayoutDurability(store).status).toBe("saved");
  });

  it("recovers when a later persist succeeds", () => {
    const store = createLayoutStore(createHistoryStore());
    store.loadLayout(layoutWithId("lay-1", "Homelab"));
    store.markExported();
    const durability = getLayoutDurability(store);

    setBrowserWriteFailures(["lay-1"]);
    expect(durability.status).toBe("error");

    setBrowserWriteFailures([]);
    expect(durability.status).toBe("saved");
  });
});
