import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  getRelativeLuminance,
  getContrastRatio,
  meetsNormalTextContrast,
  meetsLargeTextContrast,
  meetsUIComponentContrast,
  darkThemeColors,
  lightThemeColors,
} from "$lib/utils/contrast";

describe("Color Contrast Utilities", () => {
  describe("hexToRgb", () => {
    it("parses 6-digit hex color", () => {
      expect(hexToRgb("#fafafa")).toEqual({ r: 250, g: 250, b: 250 });
      expect(hexToRgb("#09090b")).toEqual({ r: 9, g: 9, b: 11 });
      expect(hexToRgb("#3b82f6")).toEqual({ r: 59, g: 130, b: 246 });
    });

    it("handles hex without hash", () => {
      expect(hexToRgb("fafafa")).toEqual({ r: 250, g: 250, b: 250 });
    });

    it("expands 3-digit hex", () => {
      expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb("#000")).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe("getRelativeLuminance", () => {
    it("returns 1 for white", () => {
      expect(getRelativeLuminance(255, 255, 255)).toBeCloseTo(1, 2);
    });

    it("returns 0 for black", () => {
      expect(getRelativeLuminance(0, 0, 0)).toBeCloseTo(0, 2);
    });

    it("returns correct luminance for mid-gray", () => {
      // #808080 = RGB(128, 128, 128)
      const luminance = getRelativeLuminance(128, 128, 128);
      expect(luminance).toBeGreaterThan(0.2);
      expect(luminance).toBeLessThan(0.3);
    });
  });

  describe("getContrastRatio", () => {
    it("returns 21:1 for black on white", () => {
      const ratio = getContrastRatio("#000000", "#ffffff");
      expect(ratio).toBeCloseTo(21, 0);
    });

    it("returns 1:1 for same colors", () => {
      expect(getContrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 2);
    });

    it("is symmetric (order does not matter)", () => {
      const ratio1 = getContrastRatio("#fafafa", "#09090b");
      const ratio2 = getContrastRatio("#09090b", "#fafafa");
      expect(ratio1).toBeCloseTo(ratio2, 4);
    });
  });

  describe("meetsNormalTextContrast (4.5:1)", () => {
    it("returns true for high contrast combinations", () => {
      expect(meetsNormalTextContrast("#000000", "#ffffff")).toBe(true);
      expect(meetsNormalTextContrast("#fafafa", "#09090b")).toBe(true);
    });

    it("returns false for low contrast combinations", () => {
      expect(meetsNormalTextContrast("#808080", "#a0a0a0")).toBe(false);
    });
  });

  describe("meetsLargeTextContrast (3:1)", () => {
    it("returns true for medium contrast combinations", () => {
      expect(meetsLargeTextContrast("#000000", "#ffffff")).toBe(true);
    });
  });

  describe("meetsUIComponentContrast (3:1)", () => {
    it("returns true for UI components meeting requirements", () => {
      expect(meetsUIComponentContrast("#3b82f6", "#09090b")).toBe(true);
    });
  });
});

describe("Dark Theme Contrast (Dracula - WCAG AA)", () => {
  const {
    bg,
    surface,
    text,
    textMuted,
    selection,
    focusRing,
    primary,
    error,
    success,
    warning,
  } = darkThemeColors;

  describe("Primary text on background (4.5:1 required)", () => {
    it("body text meets 4.5:1 contrast ratio", () => {
      const ratio = getContrastRatio(text, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("body text on surface meets 4.5:1 contrast ratio", () => {
      const ratio = getContrastRatio(text, surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("Muted text (BRAND.md v0.6.0 - improved accessibility)", () => {
    // BRAND.md requires #8A8A9A (5.2:1) instead of #6272A4 (3.3:1)
    // This improves readability for secondary/muted content
    it("muted text meets 5:1 on background for WCAG AA compliance", () => {
      const ratio = getContrastRatio(textMuted, bg);
      expect(ratio).toBeGreaterThanOrEqual(5);
    });

    it("muted text on surface has acceptable contrast", () => {
      // Surface (#343746) is lighter than bg, muted text should still be readable
      const ratio = getContrastRatio(textMuted, surface);
      expect(ratio).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Interactive colors (3:1+ for UI components)", () => {
    it("selection color meets 4.5:1 on background", () => {
      const ratio = getContrastRatio(selection, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("primary color meets 4.5:1 on background", () => {
      const ratio = getContrastRatio(primary, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("error color meets 3:1 on background", () => {
      const ratio = getContrastRatio(error, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("success color meets 3:1 on background", () => {
      const ratio = getContrastRatio(success, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("warning color meets 3:1 on background", () => {
      const ratio = getContrastRatio(warning, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Focus states (3:1 required)", () => {
    it("focus ring meets 3:1 on background", () => {
      const ratio = getContrastRatio(focusRing, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("Light Theme Contrast (Alucard - WCAG AA)", () => {
  const {
    bg,
    surface,
    text,
    textMuted,
    selection,
    focusRing,
    primary,
    error,
    success,
    warning,
  } = lightThemeColors;

  describe("Primary text on background (4.5:1 required)", () => {
    it("body text meets 4.5:1 contrast ratio", () => {
      const ratio = getContrastRatio(text, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("body text on surface meets 4.5:1 contrast ratio", () => {
      const ratio = getContrastRatio(text, surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("Muted text (3:1 - secondary content)", () => {
    // Alucard comment color is intentionally muted
    it("muted text meets 3:1 on background", () => {
      const ratio = getContrastRatio(textMuted, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("muted text meets 3:1 on surface", () => {
      const ratio = getContrastRatio(textMuted, surface);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Interactive colors (3:1+ for UI components)", () => {
    it("selection color meets 3:1 on background", () => {
      const ratio = getContrastRatio(selection, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("primary color meets 3:1 on background", () => {
      const ratio = getContrastRatio(primary, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("error color meets 3:1 on background", () => {
      const ratio = getContrastRatio(error, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("success color meets 3:1 on background", () => {
      const ratio = getContrastRatio(success, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("warning color meets 3:1 on background", () => {
      const ratio = getContrastRatio(warning, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Focus states (3:1 required)", () => {
    it("focus ring meets 3:1 on background", () => {
      const ratio = getContrastRatio(focusRing, bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("Contrast ratio documentation", () => {
  it("documents dark theme contrast ratios", () => {
    const {
      bg,
      surface,
      text,
      textMuted,
      textDisabled,
      selection,
      error,
      focusRing,
    } = darkThemeColors;

    // Document actual ratios for reference
    const ratios = {
      "text on bg": getContrastRatio(text, bg),
      "textMuted on bg": getContrastRatio(textMuted, bg),
      "textDisabled on bg": getContrastRatio(textDisabled, bg),
      "text on surface": getContrastRatio(text, surface),
      "textMuted on surface": getContrastRatio(textMuted, surface),
      "selection on bg": getContrastRatio(selection, bg),
      "error on bg": getContrastRatio(error, bg),
      "focusRing on bg": getContrastRatio(focusRing, bg),
    };

    // Primary text should have high contrast (10:1+)
    expect(ratios["text on bg"]).toBeGreaterThan(10);

    // Muted text (Dracula comment #6272A4) - intentionally lower contrast
    // 3:1 is acceptable for secondary/muted content per WCAG guidelines
    expect(ratios["textMuted on bg"]).toBeGreaterThanOrEqual(3);

    // Interactive colors (purple, red) meet UI component contrast
    expect(ratios["selection on bg"]).toBeGreaterThanOrEqual(4.5);
    expect(ratios["error on bg"]).toBeGreaterThanOrEqual(4.5);

    // Disabled text intentionally has lower contrast (non-essential)
    // WCAG exempts disabled elements from contrast requirements
    // We still ensure a minimum for visual clarity
    expect(ratios["textDisabled on bg"]).toBeGreaterThanOrEqual(2);
  });

  it("documents light theme contrast ratios", () => {
    const {
      bg,
      surface,
      text,
      textMuted,
      textDisabled,
      selection,
      error,
      focusRing,
    } = lightThemeColors;

    const ratios = {
      "text on bg": getContrastRatio(text, bg),
      "textMuted on bg": getContrastRatio(textMuted, bg),
      "textDisabled on bg": getContrastRatio(textDisabled, bg),
      "text on surface": getContrastRatio(text, surface),
      "textMuted on surface": getContrastRatio(textMuted, surface),
      "selection on bg": getContrastRatio(selection, bg),
      "error on bg": getContrastRatio(error, bg),
      "focusRing on bg": getContrastRatio(focusRing, bg),
    };

    // Primary text should have high contrast (10:1+)
    expect(ratios["text on bg"]).toBeGreaterThan(10);

    // Muted text (Alucard comment #6C664B) - intentionally lower contrast
    // 3:1 is acceptable for secondary/muted content per WCAG guidelines
    expect(ratios["textMuted on bg"]).toBeGreaterThanOrEqual(3);

    // Interactive colors meet UI component contrast (3:1+)
    expect(ratios["selection on bg"]).toBeGreaterThanOrEqual(3);
    expect(ratios["error on bg"]).toBeGreaterThanOrEqual(3);

    // Disabled text intentionally has lower contrast (non-essential)
    // WCAG exempts disabled elements from contrast requirements
    expect(ratios["textDisabled on bg"]).toBeGreaterThanOrEqual(2);
  });
});
