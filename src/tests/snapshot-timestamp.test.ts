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
  it("renders the UTC suffix in a non-UTC locale using local time", () => {
    // 14:30 UTC is 10:30 in America/New_York (EDT, UTC-4 on this date).
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parseSnapshotTimestamp("my-layout~20260615-143005.yaml")!);
    expect(formatted).toContain("10:30");
    expect(formatted).not.toContain("14:30");
  });

  it("falls back to the raw filename when the suffix is unparseable", () => {
    expect(formatSnapshotTimestamp("weird-name.yaml")).toBe("weird-name.yaml");
  });
});
