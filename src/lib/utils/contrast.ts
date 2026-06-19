/**
 * Color contrast utilities for WCAG compliance verification.
 * WCAG AA Requirements:
 * - Normal text: 4.5:1 minimum
 * - Large text (18px+ or 14px+ bold): 3:1 minimum
 * - UI components and graphics: 3:1 minimum
 */

/**
 * Parse a hex color string to RGB values.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  hex = hex.replace(/^#/, "");

  // Handle shorthand (3 chars)
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calculate relative luminance of a color.
 * Based on WCAG 2.1 definition.
 * @see https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors.
 * @see https://www.w3.org/WAI/GL/wiki/Contrast_ratio
 * @returns Contrast ratio (e.g., 4.5 for 4.5:1)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color combination meets WCAG AA for normal text.
 * Requires 4.5:1 contrast ratio.
 */
export function meetsNormalTextContrast(
  foreground: string,
  background: string,
): boolean {
  return getContrastRatio(foreground, background) >= 4.5;
}

/**
 * Check if a color combination meets WCAG AA for large text.
 * Requires 3:1 contrast ratio.
 * Large text: 18px+ or 14px+ bold.
 */
export function meetsLargeTextContrast(
  foreground: string,
  background: string,
): boolean {
  return getContrastRatio(foreground, background) >= 3;
}

/**
 * Check if a color combination meets WCAG AA for UI components.
 * Requires 3:1 contrast ratio.
 */
export function meetsUIComponentContrast(
  foreground: string,
  background: string,
): boolean {
  return getContrastRatio(foreground, background) >= 3;
}

/**
 * Token color values for testing.
 * These match the values in tokens.css.
 */
export const tokenColors = {
  // Neutrals (kept for rack background)
  "neutral-50": "#fafafa",
  "neutral-100": "#f4f4f5",
  "neutral-200": "#e4e4e7",
  "neutral-300": "#d4d4d8",
  "neutral-400": "#a1a1aa",
  "neutral-500": "#71717a",
  "neutral-600": "#52525b",
  "neutral-700": "#3f3f46",
  "neutral-800": "#27272a",
  "neutral-900": "#18181b",
  "neutral-950": "#09090b",
} as const;

/**
 * Dracula primitive color values for contrast testing.
 * Official palette: https://draculatheme.com/spec
 */
export const draculaColors = {
  // Backgrounds
  bgDarkest: "#191A21",
  bgDarker: "#21222C",
  bg: "#282A36",
  bgLight: "#343746",
  bgLighter: "#424450",
  selection: "#44475A",

  // Text
  foreground: "#F8F8F2",
  comment: "#6272A4",

  // Accents
  purple: "#BD93F9",
  pink: "#FF79C6",
  cyan: "#8BE9FD",
  green: "#50FA7B",
  orange: "#FFB86C",
  red: "#FF5555",
  yellow: "#F1FA8C",
} as const;

/**
 * Alucard primitive color values for contrast testing.
 * Official Dracula light mode palette.
 */
export const alucardColors = {
  // Backgrounds
  bgDarkest: "#BCBAB3",
  bgDarker: "#CECCC0",
  bg: "#FFFBEB",
  bgLight: "#DEDCCF",
  bgLighter: "#ECE9DF",
  selection: "#CFCFDE",
  floating: "#EFEDDC",

  // Text
  foreground: "#1F1F1F",
  comment: "#6C664B",

  // Accents
  purple: "#644AC9",
  pink: "#A3144D",
  cyan: "#036A96",
  green: "#14710A",
  orange: "#A34D14",
  red: "#CB3A2A",
  yellow: "#846E15",
} as const;

/**
 * Dark theme semantic colors (Dracula).
 * BRAND.md v0.6.0: Selection/focus uses pink, muted text improved contrast.
 */
export const darkThemeColors = {
  bg: draculaColors.bg,
  surface: draculaColors.bgLight,
  surfaceRaised: draculaColors.bgLighter,
  text: draculaColors.foreground,
  textMuted: "#9A9A9A", // BRAND.md v0.6.0: improved contrast (5.1:1)
  textDisabled: draculaColors.comment,
  selection: draculaColors.pink, // BRAND.md v0.6.0: pink (not purple)
  focusRing: draculaColors.pink, // BRAND.md v0.6.0: pink (not purple)
  primary: draculaColors.cyan,
  error: draculaColors.red,
  success: draculaColors.green,
  warning: draculaColors.orange,
  border: draculaColors.selection,
} as const;

/**
 * Light theme semantic colors (Alucard).
 * BRAND.md v0.6.0: Selection/focus uses pink.
 */
export const lightThemeColors = {
  bg: alucardColors.bg,
  surface: alucardColors.bgLight,
  surfaceRaised: alucardColors.bgLighter,
  text: alucardColors.foreground,
  textMuted: alucardColors.comment, // Light theme already has good contrast (6.8:1)
  textDisabled: alucardColors.comment,
  selection: alucardColors.pink, // BRAND.md v0.6.0: pink (not purple)
  focusRing: alucardColors.pink, // BRAND.md v0.6.0: pink (not purple)
  primary: alucardColors.cyan,
  error: alucardColors.red,
  success: alucardColors.green,
  warning: alucardColors.orange,
  border: alucardColors.bgLight,
} as const;

/**
 * Rack background color (stays dark in both themes).
 */
export const RACK_BG = tokenColors["neutral-900"];
