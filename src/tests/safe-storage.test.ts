import { afterEach, describe, it, expect, vi } from "vitest";
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from "$lib/utils/safe-storage";

describe("safeStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("safeGetItem", () => {
    it("returns value when storage is available", () => {
      localStorage.setItem("test-key", "test-value");
      expect(safeGetItem("test-key")).toBe("test-value");
      localStorage.removeItem("test-key");
    });

    it("returns null when storage throws", () => {
      vi.spyOn(localStorage, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      expect(safeGetItem("test-key")).toBeNull();
    });

    it("reads from sessionStorage when type is session", () => {
      sessionStorage.setItem("test-key", "session-value");
      expect(safeGetItem("test-key", "session")).toBe("session-value");
      sessionStorage.removeItem("test-key");
    });
  });

  describe("safeSetItem", () => {
    it("returns true on successful write", () => {
      expect(safeSetItem("test-key", "value")).toBe(true);
      localStorage.removeItem("test-key");
    });

    it("returns false when storage throws", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
      expect(safeSetItem("test-key", "value")).toBe(false);
    });
  });

  describe("safeRemoveItem", () => {
    it("does not throw when storage is unavailable", () => {
      vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      expect(() => safeRemoveItem("test-key")).not.toThrow();
    });
  });
});
