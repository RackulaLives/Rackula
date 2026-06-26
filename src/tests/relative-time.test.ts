import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "$lib/utils/relative-time";

const NOW = Date.parse("2026-06-26T12:00:00.000Z");
const at = (iso: string) => formatRelativeTime(iso, NOW);

describe("formatRelativeTime", () => {
  it("returns null for null or unparseable input", () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime("not-a-date", NOW)).toBeNull();
  });

  it("says 'just now' under 45 seconds, including small clock skew", () => {
    expect(at("2026-06-26T11:59:30.000Z")).toBe("just now");
    expect(at("2026-06-26T12:00:10.000Z")).toBe("just now");
  });

  it("formats minutes, hours, and days as elapsed time", () => {
    expect(at("2026-06-26T11:58:00.000Z")).toBe("2 minutes ago");
    expect(at("2026-06-26T09:00:00.000Z")).toBe("3 hours ago");
    expect(at("2026-06-23T12:00:00.000Z")).toBe("3 days ago");
  });
});
