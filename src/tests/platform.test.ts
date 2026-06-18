import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isMacOS,
  getModifierLabels,
  formatShortcut,
} from "$lib/utils/platform";

describe("platform utilities", () => {
  describe("isMacOS", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns true for macOS user agent", () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      });
      expect(isMacOS()).toBe(true);
    });

    it("returns true for iPhone user agent", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      });
      expect(isMacOS()).toBe(true);
    });

    it("returns true for iPad user agent", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
      });
      expect(isMacOS()).toBe(true);
    });

    it("returns false for Windows user agent", () => {
      vi.stubGlobal("navigator", {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });
      expect(isMacOS()).toBe(false);
    });

    it("returns false for Linux user agent", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      });
      expect(isMacOS()).toBe(false);
    });

    it("returns false when navigator is undefined (SSR)", () => {
      vi.stubGlobal("navigator", undefined);
      expect(isMacOS()).toBe(false);
    });
  });

  describe("getModifierLabels", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns Cmd and Option on macOS", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      });
      const labels = getModifierLabels();
      expect(labels.mod).toBe("Cmd");
      expect(labels.alt).toBe("Option");
      expect(labels.shift).toBe("Shift");
    });

    it("returns Ctrl and Alt on Windows", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      });
      const labels = getModifierLabels();
      expect(labels.mod).toBe("Ctrl");
      expect(labels.alt).toBe("Alt");
      expect(labels.shift).toBe("Shift");
    });

    it("returns Ctrl and Alt on Linux", () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      });
      const labels = getModifierLabels();
      expect(labels.mod).toBe("Ctrl");
      expect(labels.alt).toBe("Alt");
      expect(labels.shift).toBe("Shift");
    });

    it("returns Ctrl and Alt when navigator is undefined (SSR)", () => {
      vi.stubGlobal("navigator", undefined);
      const labels = getModifierLabels();
      expect(labels.mod).toBe("Ctrl");
      expect(labels.alt).toBe("Alt");
      expect(labels.shift).toBe("Shift");
    });
  });

  describe("formatShortcut", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe("on macOS", () => {
      beforeEach(() => {
        vi.stubGlobal("navigator", {
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        });
      });

      it("formats mod + key as Cmd + key", () => {
        expect(formatShortcut("mod", "S")).toBe("Cmd + S");
      });

      it("formats mod + shift + key", () => {
        expect(formatShortcut("mod", "shift", "Z")).toBe("Cmd + Shift + Z");
      });

      it("formats alt + key as Option + key", () => {
        expect(formatShortcut("alt", "F4")).toBe("Option + F4");
      });

      it("passes through non-modifier keys unchanged", () => {
        expect(formatShortcut("Escape")).toBe("Escape");
        expect(formatShortcut("F")).toBe("F");
      });
    });

    describe("on Windows/Linux", () => {
      beforeEach(() => {
        vi.stubGlobal("navigator", {
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        });
      });

      it("formats mod + key as Ctrl + key", () => {
        expect(formatShortcut("mod", "S")).toBe("Ctrl + S");
      });

      it("formats mod + shift + key", () => {
        expect(formatShortcut("mod", "shift", "Z")).toBe("Ctrl + Shift + Z");
      });

      it("formats alt + key as Alt + key", () => {
        expect(formatShortcut("alt", "F4")).toBe("Alt + F4");
      });

      it("passes through non-modifier keys unchanged", () => {
        expect(formatShortcut("Escape")).toBe("Escape");
        expect(formatShortcut("Delete")).toBe("Delete");
      });
    });
  });
});
