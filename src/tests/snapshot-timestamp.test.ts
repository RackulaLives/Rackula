import { describe, it, expect } from "vitest";
import {
  parseSnapshotTimestamp,
  formatSnapshotTimestamp,
} from "$lib/utils/snapshot-timestamp";

describe("parseSnapshotTimestamp", () => {
  it("parses the UTC suffix as a UTC instant, not local time", () => {
    const date = parseSnapshotTimestamp("my-layout~20260615-143005.yaml");
    expect(date?.toISOString()).toBe("2026-06-15T14:30:05.000Z");
  });

  it("parses a collision-suffixed snapshot name", () => {
    const date = parseSnapshotTimestamp("my-layout~20260615-143005-2.yaml");
    expect(date?.toISOString()).toBe("2026-06-15T14:30:05.000Z");
  });

  it("returns null when the filename has no timestamp suffix", () => {
    expect(parseSnapshotTimestamp("my-layout.yaml")).toBeNull();
  });
});

describe("formatSnapshotTimestamp", () => {
  it("renders the parsed UTC instant as a localized timestamp", () => {
    const filename = "my-layout~20260615-143005.yaml";
    // The real function must render the same localized string the runtime
    // would produce for the parsed UTC instant, not the raw filename suffix.
    const expected = parseSnapshotTimestamp(filename)!.toLocaleString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
    const formatted = formatSnapshotTimestamp(filename);
    expect(formatted).toBe(expected);
    expect(formatted).not.toContain("20260615-143005");
  });

  it("falls back to the raw filename when the suffix is unparseable", () => {
    expect(formatSnapshotTimestamp("weird-name.yaml")).toBe("weird-name.yaml");
  });

  it("falls back to the raw filename when components are out of range", () => {
    const filename = "my-layout~20261340-996199.yaml";
    expect(formatSnapshotTimestamp(filename)).toBe(filename);
  });
});
