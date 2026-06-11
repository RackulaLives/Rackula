/**
 * Dev Build Toast Tests
 */

import { describe, it, expect } from "vitest";
import {
  shouldShowDevBuildToast,
  formatDevBuildMessage,
} from "$lib/utils/dev-build-toast";

describe("shouldShowDevBuildToast", () => {
  it("shows when runtime config env is dev", () => {
    expect(shouldShowDevBuildToast("dev", false)).toBe(true);
  });

  it("suppresses when runtime config env is absent", () => {
    expect(shouldShowDevBuildToast(undefined, false)).toBe(false);
  });

  it("suppresses when runtime config env is prod", () => {
    expect(shouldShowDevBuildToast("prod", false)).toBe(false);
  });

  it("suppresses garbage env values", () => {
    expect(shouldShowDevBuildToast("development", false)).toBe(false);
    expect(shouldShowDevBuildToast("DEV ", false)).toBe(false);
    expect(shouldShowDevBuildToast("", false)).toBe(false);
  });

  it("shows in vite dev mode regardless of runtime config", () => {
    expect(shouldShowDevBuildToast(undefined, true)).toBe(true);
    expect(shouldShowDevBuildToast("prod", true)).toBe(true);
  });
});

describe("formatDevBuildMessage", () => {
  const now = new Date("2026-06-10T12:23:00Z");

  it("formats version, commit hash, and relative build time", () => {
    expect(
      formatDevBuildMessage("26.5.0", "9e14975e", "2026-06-10T12:00:00Z", now),
    ).toBe("Dev build v26.5.0 (9e14975e, built 23 min ago)");
  });

  it("omits missing commit hash", () => {
    expect(
      formatDevBuildMessage("26.5.0", "", "2026-06-10T12:00:00Z", now),
    ).toBe("Dev build v26.5.0 (built 23 min ago)");
  });

  it("omits missing build time", () => {
    expect(formatDevBuildMessage("26.5.0", "9e14975e", "", now)).toBe(
      "Dev build v26.5.0 (9e14975e)",
    );
  });

  it("degrades to version only when both are missing", () => {
    expect(formatDevBuildMessage("26.5.0", "", "", now)).toBe(
      "Dev build v26.5.0",
    );
  });
});
