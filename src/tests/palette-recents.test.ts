import { describe, it, expect, beforeEach } from "vitest";
import {
  getRecents,
  recordCommand,
  resetPaletteRecents,
} from "$lib/stores/palette-recents.svelte";
import { safeSetItem } from "$lib/utils/safe-storage";

const KEY = "rackula:palette:recents";

beforeEach(() => {
  localStorage.clear();
  resetPaletteRecents();
});

describe("palette recents store", () => {
  it("records an executed command id", () => {
    recordCommand("fit-all");
    expect(getRecents()).toEqual(["fit-all"]);
  });

  it("moves a re-run command to the front (MRU) without duplicating", () => {
    recordCommand("fit-all");
    recordCommand("share");
    recordCommand("fit-all");
    expect(getRecents()).toEqual(["fit-all", "share"]);
  });

  it("caps the list at five most-recent ids", () => {
    recordCommand("fit-all");
    recordCommand("share");
    recordCommand("export");
    recordCommand("undo");
    recordCommand("redo");
    recordCommand("toggle-display-mode");
    expect(getRecents()).toEqual([
      "toggle-display-mode",
      "redo",
      "undo",
      "export",
      "share",
    ]);
  });

  it("persists recents across a store reset (load roundtrip)", () => {
    recordCommand("share");
    recordCommand("fit-all");
    resetPaletteRecents();
    expect(getRecents()).toEqual(["fit-all", "share"]);
  });

  it("drops unknown ids that are not in the registry on load", () => {
    safeSetItem(KEY, JSON.stringify(["fit-all", "not-a-real-command"]));
    resetPaletteRecents();
    expect(getRecents()).toEqual(["fit-all"]);
  });

  it("tolerates malformed stored JSON without throwing", () => {
    safeSetItem(KEY, "{not json");
    resetPaletteRecents();
    expect(getRecents()).toEqual([]);
  });

  it("tolerates a stored value that is not an array of strings", () => {
    safeSetItem(KEY, JSON.stringify({ a: 1 }));
    resetPaletteRecents();
    expect(getRecents()).toEqual([]);
    safeSetItem(KEY, JSON.stringify([1, 2, 3]));
    resetPaletteRecents();
    expect(getRecents()).toEqual([]);
  });

  it("caps an oversized stored array to five on load", () => {
    safeSetItem(
      KEY,
      JSON.stringify([
        "toggle-display-mode",
        "redo",
        "undo",
        "export",
        "share",
        "fit-all",
      ]),
    );
    resetPaletteRecents();
    // eslint-disable-next-line no-restricted-syntax -- behavioural invariant: load caps at 5
    expect(getRecents()).toHaveLength(5);
    expect(getRecents()).not.toContain("fit-all");
  });
});
