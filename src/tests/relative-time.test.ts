import { describe, it, expect } from "vitest";
import { formatTimeAgo } from "$lib/utils/relative-time";

const NOW = Date.parse("2026-06-26T12:00:00.000Z");
const at = (iso: string) => formatTimeAgo(iso, NOW);

describe("formatTimeAgo", () => {
  it("returns null for null or unparseable input", () => {
    expect(formatTimeAgo(null, NOW)).toBeNull();
    expect(formatTimeAgo("not-a-date", NOW)).toBeNull();
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

  it("returns 'in 2 minutes' for a timestamp ~2 minutes in the future", () => {
    expect(at("2026-06-26T12:02:00.000Z")).toBe("in 2 minutes");
  });

  it("returns 'just now' for a timestamp ~10 seconds in the future", () => {
    expect(at("2026-06-26T12:00:10.000Z")).toBe("just now");
  });
});
