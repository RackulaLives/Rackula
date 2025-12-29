/**
 * Text Sizing Utilities
 *
 * Provides functions for calculating optimal font sizes and truncating text
 * to fit within available width in SVG device labels.
 *
 * Uses character-width estimation since SVG text measurement requires DOM access.
 * The estimation is calibrated for system-ui/sans-serif fonts used in device labels.
 */

// =============================================================================
// Shared Constants - Used by RackDevice.svelte and export.ts for consistency
// =============================================================================

/** Maximum font size for device labels in label mode */
export const DEVICE_LABEL_MAX_FONT = 13;

/** Maximum font size for device labels in image overlay mode */
export const DEVICE_LABEL_IMAGE_MAX_FONT = 12;

/** Minimum readable font size for device labels */
export const DEVICE_LABEL_MIN_FONT = 9;

/** Space reserved for category icon on left side of device label */
export const DEVICE_LABEL_ICON_SPACE_LEFT = 28;

/** Space reserved for grip icon on right side of device label */
export const DEVICE_LABEL_ICON_SPACE_RIGHT = 20;

// =============================================================================
// Types
// =============================================================================

export interface FontSizeOptions {
  maxFontSize: number;
  minFontSize: number;
  availableWidth: number;
}

export interface FitTextResult {
  text: string;
  fontSize: number;
}

/**
 * Average character width as a ratio of font size.
 * Calibrated for system-ui/sans-serif fonts.
 * Most characters are roughly 0.55-0.6x the font size in width.
 */
const CHAR_WIDTH_RATIO = 0.58;

/**
 * Estimates the width of text at a given font size.
 * @param text - The text to measure
 * @param fontSize - The font size in pixels
 * @returns Estimated width in pixels
 */
function estimateTextWidth(text: string, fontSize: number): number {
  if (!text) return 0;
  return text.length * fontSize * CHAR_WIDTH_RATIO;
}

/**
 * Calculates the optimal font size for text to fit within available width.
 * Scales down from maxFontSize to minFontSize as needed.
 *
 * @param text - The text to fit
 * @param options - Font size constraints and available width
 * @returns The calculated font size (between minFontSize and maxFontSize)
 */
export function calculateFontSize(
  text: string,
  options: FontSizeOptions,
): number {
  const { maxFontSize, minFontSize, availableWidth } = options;

  // Empty or very short text gets max font size
  if (!text || text.length === 0) {
    return maxFontSize;
  }

  // Calculate width at max font size
  const widthAtMax = estimateTextWidth(text, maxFontSize);

  // If it fits at max size, use max
  if (widthAtMax <= availableWidth) {
    return maxFontSize;
  }

  // Calculate the font size needed to fit
  // width = length * fontSize * ratio
  // fontSize = width / (length * ratio)
  const idealFontSize = availableWidth / (text.length * CHAR_WIDTH_RATIO);

  // Clamp between min and max
  return Math.max(
    minFontSize,
    Math.min(maxFontSize, Math.round(idealFontSize)),
  );
}

/**
 * Truncates text with ellipsis to fit within available width at given font size.
 *
 * @param text - The text to truncate
 * @param availableWidth - The maximum width in pixels
 * @param fontSize - The font size in pixels
 * @returns The truncated text with ellipsis, or original if it fits
 */
export function truncateWithEllipsis(
  text: string,
  availableWidth: number,
  fontSize: number,
): string {
  if (!text) return "";

  const textWidth = estimateTextWidth(text, fontSize);

  // If it fits, return as-is
  if (textWidth <= availableWidth) {
    return text;
  }

  // Calculate how many characters can fit (leaving room for ellipsis)
  const ellipsisWidth = estimateTextWidth("…", fontSize);
  const availableForText = availableWidth - ellipsisWidth;

  if (availableForText <= 0) {
    return "…";
  }

  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  const maxChars = Math.floor(availableForText / charWidth);

  if (maxChars <= 0) {
    return "…";
  }

  return text.substring(0, maxChars) + "…";
}

/**
 * Fits text to available width by first scaling font size,
 * then truncating with ellipsis if still too long at minimum size.
 *
 * @param text - The text to fit
 * @param options - Font size constraints and available width
 * @returns Object with fitted text and calculated font size
 */
export function fitTextToWidth(
  text: string,
  options: FontSizeOptions,
): FitTextResult {
  const { minFontSize, maxFontSize, availableWidth } = options;

  // Empty text returns as-is with max font size
  if (!text) {
    return { text: "", fontSize: maxFontSize };
  }

  // Edge case: zero or negative available width - return ellipsis at min size
  if (availableWidth <= 0) {
    return { text: "…", fontSize: minFontSize };
  }

  // First, calculate optimal font size
  const fontSize = calculateFontSize(text, options);

  // If at minimum size and still doesn't fit, truncate
  if (fontSize === minFontSize) {
    const textWidth = estimateTextWidth(text, fontSize);
    if (textWidth > availableWidth) {
      const truncatedText = truncateWithEllipsis(
        text,
        availableWidth,
        fontSize,
      );
      return { text: truncatedText, fontSize };
    }
  }

  return { text, fontSize };
}
