import { describe, it, expect } from "vitest";
import {
  calculateFontSize,
  truncateWithEllipsis,
  fitTextToWidth,
  DEVICE_LABEL_MAX_FONT,
  DEVICE_LABEL_MIN_FONT,
  DEVICE_LABEL_IMAGE_MAX_FONT,
  DEVICE_LABEL_ICON_SPACE_LEFT,
  DEVICE_LABEL_ICON_SPACE_RIGHT,
} from "$lib/utils/text-sizing";

describe("Text Sizing Utility", () => {
  describe("calculateFontSize", () => {
    const defaultOptions = {
      maxFontSize: 13,
      minFontSize: 9,
      availableWidth: 150,
    };

    it("returns max font size for short text", () => {
      const result = calculateFontSize("Server", defaultOptions);
      expect(result).toBe(13);
    });

    it("returns max font size for empty text", () => {
      const result = calculateFontSize("", defaultOptions);
      expect(result).toBe(13);
    });

    it("scales down font for longer text", () => {
      const result = calculateFontSize(
        "HP ProLiant DL380 Gen10 - Production DB",
        defaultOptions,
      );
      expect(result).toBeLessThan(13);
      expect(result).toBeGreaterThanOrEqual(9);
    });

    it("returns min font size for very long text", () => {
      const result = calculateFontSize(
        "This is an extremely long device name that would never fit in a normal rack device label area",
        defaultOptions,
      );
      expect(result).toBe(9);
    });

    it("respects custom min/max font sizes", () => {
      const result = calculateFontSize("Medium length name", {
        maxFontSize: 16,
        minFontSize: 10,
        availableWidth: 100,
      });
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(16);
    });

    it("handles narrow available width", () => {
      const result = calculateFontSize("Server Name", {
        ...defaultOptions,
        availableWidth: 50,
      });
      expect(result).toBeLessThan(13);
    });

    it("handles wide available width", () => {
      const result = calculateFontSize("Short", {
        ...defaultOptions,
        availableWidth: 300,
      });
      expect(result).toBe(13);
    });
  });

  describe("truncateWithEllipsis", () => {
    it("returns original text if it fits", () => {
      const result = truncateWithEllipsis("Short", 100, 13);
      expect(result).toBe("Short");
    });

    it("truncates long text with ellipsis", () => {
      const result = truncateWithEllipsis(
        "This is a very long device name",
        80,
        13,
      );
      expect(result).toContain("…");
      expect(result.length).toBeLessThan(
        "This is a very long device name".length,
      );
    });

    it("returns ellipsis only for extremely narrow width", () => {
      const result = truncateWithEllipsis("Server", 10, 13);
      expect(result).toBe("…");
    });

    it("handles empty string", () => {
      const result = truncateWithEllipsis("", 100, 13);
      expect(result).toBe("");
    });
  });

  describe("fitTextToWidth", () => {
    const defaultOptions = {
      maxFontSize: 13,
      minFontSize: 9,
      availableWidth: 150,
    };

    it("returns original text and max size for short text", () => {
      const result = fitTextToWidth("Server", defaultOptions);
      expect(result.text).toBe("Server");
      expect(result.fontSize).toBe(13);
    });

    it("scales font for medium-length text", () => {
      const result = fitTextToWidth("HP ProLiant DL380 Gen10", defaultOptions);
      expect(result.text).toBe("HP ProLiant DL380 Gen10");
      expect(result.fontSize).toBeLessThanOrEqual(13);
      expect(result.fontSize).toBeGreaterThanOrEqual(9);
    });

    it("truncates and uses min size for very long text", () => {
      const result = fitTextToWidth(
        "This is an extremely long device name that will definitely need truncation",
        { ...defaultOptions, availableWidth: 100 },
      );
      expect(result.text).toContain("…");
      expect(result.fontSize).toBe(9);
    });

    it("handles empty text", () => {
      const result = fitTextToWidth("", defaultOptions);
      expect(result.text).toBe("");
      expect(result.fontSize).toBe(13);
    });

    it("handles zero available width", () => {
      const result = fitTextToWidth("Server", {
        ...defaultOptions,
        availableWidth: 0,
      });
      expect(result.text).toBe("…");
      expect(result.fontSize).toBe(9);
    });

    it("handles negative available width", () => {
      const result = fitTextToWidth("Server", {
        ...defaultOptions,
        availableWidth: -100,
      });
      expect(result.text).toBe("…");
      expect(result.fontSize).toBe(9);
    });

    it("uses fixed character width regardless of actual glyph width", () => {
      // Implementation uses a fixed CHAR_WIDTH_RATIO (0.58) for all characters.
      // This means "WWWWWWWWWW" and "iiiiiiiiii" (both 10 chars) produce
      // identical results despite real rendering differences.
      const wideChars = fitTextToWidth("WWWWWWWWWW", {
        ...defaultOptions,
        availableWidth: 100,
      });
      const narrowChars = fitTextToWidth("iiiiiiiiii", {
        ...defaultOptions,
        availableWidth: 100,
      });
      // Same character count = same result (known limitation)
      expect(wideChars.fontSize).toBe(narrowChars.fontSize);
      expect(wideChars.text.length).toBe(narrowChars.text.length);
    });

    it("scales based on character count not actual glyph widths", () => {
      // With constrained width, longer strings scale down regardless of character type
      const constrainedOptions = { ...defaultOptions, availableWidth: 80 };
      const shortText = fitTextToWidth("WWWWW", constrainedOptions); // 5 chars
      const longText = fitTextToWidth("iiiiiiiiiiiiiiii", constrainedOptions); // 16 chars
      // Shorter string gets larger font despite using "wide" characters
      // because algorithm only considers character count, not glyph widths
      expect(shortText.fontSize).toBeGreaterThan(longText.fontSize);
    });
  });

  describe("Shared Constants", () => {
    it("exports correct device label font sizes", () => {
      expect(DEVICE_LABEL_MAX_FONT).toBe(13);
      expect(DEVICE_LABEL_MIN_FONT).toBe(9);
      expect(DEVICE_LABEL_IMAGE_MAX_FONT).toBe(12);
    });

    it("exports correct icon spacing values", () => {
      expect(DEVICE_LABEL_ICON_SPACE_LEFT).toBe(28);
      expect(DEVICE_LABEL_ICON_SPACE_RIGHT).toBe(20);
    });

    it("icon spacing leaves reasonable text area", () => {
      // For a typical device width of ~140px (150px - 2*5px rails)
      const typicalDeviceWidth = 140;
      const availableForText =
        typicalDeviceWidth -
        DEVICE_LABEL_ICON_SPACE_LEFT -
        DEVICE_LABEL_ICON_SPACE_RIGHT;
      // Should leave at least 80px for text
      expect(availableForText).toBeGreaterThanOrEqual(80);
    });
  });
});
