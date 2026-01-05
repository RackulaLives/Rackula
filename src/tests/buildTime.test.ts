/**
 * Build Time Utilities Tests
 */

import { describe, it, expect } from "vitest";
import {
  formatRelativeTime,
  formatFullTimestamp,
  isBuildStale,
  STALE_THRESHOLD_MS,
} from "$lib/utils/buildTime";

describe("buildTime utilities", () => {
  describe("formatRelativeTime", () => {
    const baseTime = new Date("2025-12-30T17:00:00Z");

    it("should format seconds as less than 1 min", () => {
      const buildTime = new Date("2025-12-30T16:59:30Z"); // 30 seconds ago
      expect(formatRelativeTime(buildTime, baseTime)).toBe("< 1 min");
    });

    it("should format minutes correctly", () => {
      const buildTime = new Date("2025-12-30T16:55:00Z"); // 5 minutes ago
      expect(formatRelativeTime(buildTime, baseTime)).toBe("5 min");
    });

    it("should format hours correctly", () => {
      const buildTime = new Date("2025-12-30T15:00:00Z"); // 2 hours ago
      expect(formatRelativeTime(buildTime, baseTime)).toBe("2 hours");
    });

    it("should format days correctly", () => {
      const buildTime = new Date("2025-12-28T17:00:00Z"); // 2 days ago
      expect(formatRelativeTime(buildTime, baseTime)).toBe("2 days");
    });

    it("should handle ISO string input", () => {
      const buildTime = "2025-12-30T16:55:00Z"; // 5 minutes ago
      expect(formatRelativeTime(buildTime, baseTime)).toBe("5 min");
    });

    it("should handle 0 seconds", () => {
      expect(formatRelativeTime(baseTime, baseTime)).toBe("< 1 min");
    });

    it("should handle future dates gracefully", () => {
      const futureTime = new Date("2025-12-30T18:00:00Z"); // 1 hour in the future
      expect(formatRelativeTime(futureTime, baseTime)).toBe("< 1 min");
    });

    it("should use singular for 1 hour", () => {
      const buildTime = new Date("2025-12-30T15:30:00Z"); // 90 minutes ago = 1h
      expect(formatRelativeTime(buildTime, baseTime)).toBe("1 hour");
    });

    it("should use singular for 1 day", () => {
      const buildTime = new Date("2025-12-29T10:00:00Z"); // 31 hours ago = 1d
      expect(formatRelativeTime(buildTime, baseTime)).toBe("1 day");
    });
  });

  describe("formatFullTimestamp", () => {
    it("should format Date object as full timestamp", () => {
      const buildTime = new Date("2025-12-30T17:15:00Z");
      const result = formatFullTimestamp(buildTime);
      // Result depends on locale, but should contain the date components
      expect(result).toContain("2025");
      expect(result).toContain("30");
    });

    it("should handle ISO string input", () => {
      const buildTime = "2025-12-30T17:15:00Z";
      const result = formatFullTimestamp(buildTime);
      expect(result).toContain("2025");
    });
  });

  describe("isBuildStale", () => {
    const baseTime = new Date("2025-12-30T17:00:00Z");

    it("should return false for recent builds", () => {
      const buildTime = new Date("2025-12-30T16:30:00Z"); // 30 minutes ago
      expect(isBuildStale(buildTime, baseTime)).toBe(false);
    });

    it("should return true for builds older than 1 hour", () => {
      const buildTime = new Date("2025-12-30T15:59:59Z"); // Just over 1 hour ago
      expect(isBuildStale(buildTime, baseTime)).toBe(true);
    });

    it("should return true exactly at threshold", () => {
      const buildTime = new Date("2025-12-30T16:00:00Z"); // Exactly 1 hour ago
      expect(isBuildStale(buildTime, baseTime)).toBe(true);
    });

    it("should handle ISO string input", () => {
      const buildTime = "2025-12-30T15:00:00Z"; // 2 hours ago
      expect(isBuildStale(buildTime, baseTime)).toBe(true);
    });

    it("should respect custom threshold", () => {
      const buildTime = new Date("2025-12-30T16:55:00Z"); // 5 minutes ago
      const fiveMinutes = 5 * 60 * 1000;
      expect(isBuildStale(buildTime, baseTime, fiveMinutes)).toBe(true);
    });

    it("should use correct default threshold (1 hour)", () => {
      expect(STALE_THRESHOLD_MS).toBe(60 * 60 * 1000);
    });
  });
});
