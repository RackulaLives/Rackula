/**
 * Debug Logging Utility Tests
 * Verifies debug utilities using the debug npm package
 *
 * The debug package uses localStorage.debug for filtering, so we can't
 * easily test output format. Instead we verify the exports work correctly.
 */

import { describe, it, expect } from "vitest";
import {
  debug,
  layoutDebug,
  canvasDebug,
  cableDebug,
  appDebug,
} from "$lib/utils/debug";

describe("Debug utilities", () => {
  describe("Legacy compatibility", () => {
    it("debug methods are callable without errors", () => {
      // These should not throw even when disabled
      expect(() => debug.log("test")).not.toThrow();
      expect(() => debug.info("test")).not.toThrow();
      expect(() => debug.warn("test")).not.toThrow();
      expect(() => debug.error("test")).not.toThrow();
      expect(() => debug.group("test")).not.toThrow();
      expect(() => debug.groupEnd()).not.toThrow();
    });

    it("devicePlace is callable with proper data", () => {
      expect(() =>
        debug.devicePlace({
          slug: "test-device",
          position: 1,
          passedFace: "front",
          effectiveFace: "both",
          deviceName: "Test Device",
          isFullDepth: true,
          result: "success",
        }),
      ).not.toThrow();
    });

    it("deviceMove is callable with proper data", () => {
      expect(() =>
        debug.deviceMove({
          index: 0,
          deviceName: "Test Device",
          face: "both",
          fromPosition: 1,
          toPosition: 5,
          result: "success",
        }),
      ).not.toThrow();
    });
  });

  describe("Namespace loggers", () => {
    it("all namespace loggers are callable without errors", () => {
      // Layout namespace loggers
      expect(() => layoutDebug.state("test")).not.toThrow();
      expect(() => layoutDebug.device("test")).not.toThrow();
      // Canvas namespace loggers
      expect(() => canvasDebug.transform("test")).not.toThrow();
      expect(() => canvasDebug.panzoom("test")).not.toThrow();
      // Cable namespace logger
      expect(() => cableDebug.validation("test")).not.toThrow();
      // App namespace logger
      expect(() => appDebug.mobile("test")).not.toThrow();
    });
  });
});
