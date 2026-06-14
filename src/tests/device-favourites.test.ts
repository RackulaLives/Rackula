/**
 * Device Favourites Tests
 *
 * Covers the localStorage-backed favourites set used by the device palette:
 * load/save round-trips, toggle behaviour, and resilience to malformed storage.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFavouritesFromStorage,
  saveFavouritesToStorage,
  toggleFavourite,
  FAVOURITES_STORAGE_KEY,
} from "$lib/utils/deviceFavourites";

beforeEach(() => {
  localStorage.clear();
});

describe("deviceFavourites", () => {
  describe("loadFavouritesFromStorage", () => {
    it("returns an empty set when nothing is stored", () => {
      expect(loadFavouritesFromStorage().size).toBe(0);
    });

    it("round-trips saved slugs preserving order", () => {
      saveFavouritesToStorage(["server-a", "switch-b"]);
      const loaded = loadFavouritesFromStorage();
      expect([...loaded]).toEqual(["server-a", "switch-b"]);
    });

    it("returns an empty set when stored JSON is malformed", () => {
      localStorage.setItem(FAVOURITES_STORAGE_KEY, "not-json{");
      expect(loadFavouritesFromStorage().size).toBe(0);
    });

    it("ignores non-string entries in stored JSON", () => {
      localStorage.setItem(
        FAVOURITES_STORAGE_KEY,
        JSON.stringify(["valid", 42, null, "also-valid"]),
      );
      expect([...loadFavouritesFromStorage()]).toEqual(["valid", "also-valid"]);
    });

    it("returns an empty set when stored JSON is not an array", () => {
      localStorage.setItem(
        FAVOURITES_STORAGE_KEY,
        JSON.stringify({ slug: "server-a" }),
      );
      expect(loadFavouritesFromStorage().size).toBe(0);
    });
  });

  describe("toggleFavourite", () => {
    it("adds a slug that is absent", () => {
      const next = toggleFavourite(new Set(["a"]), "b");
      expect([...next]).toEqual(["a", "b"]);
    });

    it("removes a slug that is present", () => {
      const next = toggleFavourite(new Set(["a", "b"]), "a");
      expect([...next]).toEqual(["b"]);
    });

    it("does not mutate the input set", () => {
      const original = new Set(["a"]);
      toggleFavourite(original, "b");
      expect([...original]).toEqual(["a"]);
    });

    it("preserves insertion order when re-adding after removal", () => {
      let set = new Set(["a", "b"]);
      set = toggleFavourite(set, "a"); // -> ["b"]
      set = toggleFavourite(set, "a"); // -> ["b", "a"]
      expect([...set]).toEqual(["b", "a"]);
    });
  });

  describe("saveFavouritesToStorage", () => {
    it("persists an iterable so a later load reflects the change", () => {
      saveFavouritesToStorage(new Set(["x", "y"]));
      expect([...loadFavouritesFromStorage()]).toEqual(["x", "y"]);
    });

    it("clears storage to an empty set", () => {
      saveFavouritesToStorage(["x"]);
      saveFavouritesToStorage([]);
      expect(loadFavouritesFromStorage().size).toBe(0);
    });
  });
});
