import { afterEach, describe, it, expect, vi } from "vitest";
import {
  safeGetItem,
  safeSetItem,
  safeSetItemWithStatus,
  safeRemoveItem,
} from "$lib/utils/safe-storage";

/** A DOMException-shaped quota error, as the browsers actually throw it. */
function quotaError(name: string, code: number): Error {
  const error = new Error(name);
  error.name = name;
  Object.defineProperty(error, "code", { value: code });
  return error;
}

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

  // #3375: a quota failure has to be told apart from storage being unavailable,
  // because only the quota case can honestly tell the user their browser is out
  // of space and that exporting to a file is the way out.
  describe("safeSetItemWithStatus", () => {
    it("reports success with no failure reason", () => {
      expect(safeSetItemWithStatus("test-key", "value")).toEqual({
        ok: true,
        failure: null,
      });
      localStorage.removeItem("test-key");
    });

    it("classifies the Chrome/Safari quota error as quota", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw quotaError("QuotaExceededError", 22);
      });
      expect(safeSetItemWithStatus("test-key", "value")).toEqual({
        ok: false,
        failure: "quota",
      });
    });

    it("classifies the Firefox quota error as quota", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw quotaError("NS_ERROR_DOM_QUOTA_REACHED", 1014);
      });
      expect(safeSetItemWithStatus("test-key", "value").failure).toBe("quota");
    });

    it("classifies a blocked-storage error as unavailable, not quota", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw quotaError("SecurityError", 18);
      });
      expect(safeSetItemWithStatus("test-key", "value")).toEqual({
        ok: false,
        failure: "unavailable",
      });
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
