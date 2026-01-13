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
    it("exports debug object with expected methods", () => {
      expect(debug.log).toBeDefined();
      expect(debug.info).toBeDefined();
      expect(debug.warn).toBeDefined();
      expect(debug.error).toBeDefined();
      expect(debug.group).toBeDefined();
      expect(debug.groupEnd).toBeDefined();
      expect(debug.isEnabled).toBeDefined();
      expect(debug.devicePlace).toBeDefined();
      expect(debug.deviceMove).toBeDefined();
    });

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
    it("exports layoutDebug with state and device namespaces", () => {
      expect(layoutDebug.state).toBeDefined();
      expect(layoutDebug.device).toBeDefined();
      expect(typeof layoutDebug.state).toBe("function");
      expect(typeof layoutDebug.device).toBe("function");
    });

    it("exports canvasDebug with transform and panzoom namespaces", () => {
      expect(canvasDebug.transform).toBeDefined();
      expect(canvasDebug.panzoom).toBeDefined();
      expect(typeof canvasDebug.transform).toBe("function");
      expect(typeof canvasDebug.panzoom).toBe("function");
    });

    it("exports cableDebug with validation namespace", () => {
      expect(cableDebug.validation).toBeDefined();
      expect(typeof cableDebug.validation).toBe("function");
    });

    it("exports appDebug with mobile namespace", () => {
      expect(appDebug.mobile).toBeDefined();
      expect(typeof appDebug.mobile).toBe("function");
    });

    it("namespace loggers are callable without errors", () => {
      expect(() => layoutDebug.state("test")).not.toThrow();
      expect(() => layoutDebug.device("test")).not.toThrow();
      expect(() => canvasDebug.transform("test")).not.toThrow();
      expect(() => canvasDebug.panzoom("test")).not.toThrow();
      expect(() => cableDebug.validation("test")).not.toThrow();
      expect(() => appDebug.mobile("test")).not.toThrow();
    });
  });
});
