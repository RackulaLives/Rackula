import { describe, expect, it } from "vitest";
import { buildFolderName, isUuid } from "$lib/utils/folder-structure";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("buildFolderName", () => {
  it("preserves simple layout names", () => {
    expect(buildFolderName("My Homelab", VALID_UUID)).toBe(
      "My Homelab-550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("sanitizes path separators and dot segments", () => {
    expect(buildFolderName("Lab/../Prod", VALID_UUID)).toBe(
      "Lab Prod-550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("falls back to layout when name sanitizes to empty", () => {
    expect(buildFolderName("..", VALID_UUID)).toBe(
      "layout-550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("throws when UUID is invalid", () => {
    expect(() => buildFolderName("Layout", "not-a-uuid")).toThrow(
      "Invalid UUID: not-a-uuid",
    );
  });
});

describe("isUuid", () => {
  it("matches valid UUID format", () => {
    expect(isUuid(VALID_UUID)).toBe(true);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});
