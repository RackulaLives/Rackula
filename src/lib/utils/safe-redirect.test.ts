import { describe, it, expect } from "vitest";
import { getSafeNextPath } from "./safe-redirect";

const ORIGIN = "https://app.example.com";

describe("getSafeNextPath", () => {
  it("blocks backslash bypass (raw)", () => {
    expect(getSafeNextPath("?next=/\\evil.com", ORIGIN)).toBe("/");
  });

  it("blocks backslash bypass (percent-encoded, matches issue repro)", () => {
    expect(getSafeNextPath("?next=%2F%5Cevil.com", ORIGIN)).toBe("/");
  });

  it("blocks backslash bypass (lowercase encoded backslash)", () => {
    expect(getSafeNextPath("?next=%2F%5cevil.com", ORIGIN)).toBe("/");
  });

  it("blocks backslash bypass smuggled past a control character", () => {
    // A stray tab/CR between the leading slash and the backslash is
    // stripped by URL parsing (same as a browser), so this still
    // normalises to a protocol-relative //evil.com and must be blocked.
    expect(getSafeNextPath("?next=%2F%09%5Cevil.com", ORIGIN)).toBe("/");
  });

  it("blocks protocol-relative //evil.com", () => {
    expect(getSafeNextPath("?next=//evil.com", ORIGIN)).toBe("/");
  });

  it("blocks an absolute URL with a scheme", () => {
    expect(getSafeNextPath("?next=https%3A%2F%2Fevil.com", ORIGIN)).toBe("/");
  });

  it("blocks a path that does not start with /", () => {
    expect(getSafeNextPath("?next=evil.com", ORIGIN)).toBe("/");
  });

  it("allows a legitimate same-origin relative path", () => {
    expect(getSafeNextPath("?next=%2Fdashboard", ORIGIN)).toBe("/dashboard");
  });

  it("allows a legitimate same-origin path with query and hash", () => {
    expect(
      getSafeNextPath("?next=%2Frack%2F123%3Ftab%3Ddevices%23top", ORIGIN),
    ).toBe("/rack/123?tab=devices#top");
  });

  it("defaults to / when next is missing", () => {
    expect(getSafeNextPath("", ORIGIN)).toBe("/");
  });

  it("defaults to / when next is empty", () => {
    expect(getSafeNextPath("?next=", ORIGIN)).toBe("/");
  });
});
