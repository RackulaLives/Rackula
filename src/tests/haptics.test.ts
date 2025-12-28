import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isHapticSupported,
  hapticTap,
  hapticSuccess,
  hapticError,
  hapticCancel,
} from "$lib/utils/haptics";

describe("haptics", () => {
  let originalNavigator: typeof navigator;
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalNavigator = global.navigator;
    vibrateMock = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe("isHapticSupported", () => {
    it("returns true when vibrate is available", () => {
      Object.defineProperty(global, "navigator", {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      expect(isHapticSupported()).toBe(true);
    });

    it("returns false when vibrate is not available", () => {
      Object.defineProperty(global, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(isHapticSupported()).toBe(false);
    });

    it("returns false when navigator is undefined", () => {
      Object.defineProperty(global, "navigator", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(isHapticSupported()).toBe(false);
    });
  });

  describe("hapticTap", () => {
    it("calls vibrate with tap pattern (50ms)", () => {
      Object.defineProperty(global, "navigator", {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      hapticTap();

      expect(vibrateMock).toHaveBeenCalledWith(50);
    });

    it("does not throw when vibrate is not supported", () => {
      Object.defineProperty(global, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(() => hapticTap()).not.toThrow();
    });
  });

  describe("hapticSuccess", () => {
    it("calls vibrate with success pattern (100ms)", () => {
      Object.defineProperty(global, "navigator", {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      hapticSuccess();

      expect(vibrateMock).toHaveBeenCalledWith(100);
    });

    it("does not throw when vibrate is not supported", () => {
      Object.defineProperty(global, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(() => hapticSuccess()).not.toThrow();
    });
  });

  describe("hapticError", () => {
    it("calls vibrate with error pattern [50, 50, 50]", () => {
      Object.defineProperty(global, "navigator", {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      hapticError();

      expect(vibrateMock).toHaveBeenCalledWith([50, 50, 50]);
    });

    it("does not throw when vibrate is not supported", () => {
      Object.defineProperty(global, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(() => hapticError()).not.toThrow();
    });
  });

  describe("hapticCancel", () => {
    it("calls vibrate with cancel pattern [25, 50, 25]", () => {
      Object.defineProperty(global, "navigator", {
        value: { vibrate: vibrateMock },
        writable: true,
        configurable: true,
      });

      hapticCancel();

      expect(vibrateMock).toHaveBeenCalledWith([25, 50, 25]);
    });

    it("does not throw when vibrate is not supported", () => {
      Object.defineProperty(global, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(() => hapticCancel()).not.toThrow();
    });
  });

  describe("error handling", () => {
    it("silently catches vibrate errors", () => {
      const errorMock = vi.fn().mockImplementation(() => {
        throw new Error("Vibration blocked");
      });

      Object.defineProperty(global, "navigator", {
        value: { vibrate: errorMock },
        writable: true,
        configurable: true,
      });

      expect(() => hapticTap()).not.toThrow();
      expect(() => hapticSuccess()).not.toThrow();
      expect(() => hapticError()).not.toThrow();
      expect(() => hapticCancel()).not.toThrow();
    });
  });
});
