/**
 * Text Sizing Utilities
 *
 * Provides functions for calculating optimal font sizes and truncating text
 * to fit within available width in SVG device labels.
 *
 * Uses character-width estimation since SVG text measurement requires DOM access.
 * The estimation is calibrated for system-ui/sans-serif fonts used in device labels.
 */

import type { DeviceZones } from "$lib/utils/port-geometry";

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

/**
 * Estimated width of the REAR tag: 4 capitals at 8px, weight 600, with
 * 0.06em letter spacing (RackDevice's .rear-badge).
 */
export const REAR_TAG_WIDTH = 24;

/** Space between the label and an in-flow REAR tag. */
export const REAR_TAG_GAP = 4;

// =============================================================================
// Types
// =============================================================================

/** Where a device's name label sits and how wide it may be. */
export interface DeviceLabelLayout {
  /** Label x: the device centre when centred, else the label's left edge. */
  x: number;
  anchor: "middle" | "start";
  /** Width to fit the label into. Never negative. */
  availableWidth: number;
  /**
   * Right edge and vertical centre of the REAR tag when it sits in the flow,
   * between the label and the port zone. Undefined when the tag keeps its
   * floating top-right position (no visible ports) or is not shown.
   */
  rearTag?: { x: number; y: number };
}

export interface DeviceLabelLayoutOptions {
  /** Zones from computeDeviceZones() for this device and rack face. */
  zones: DeviceZones;
  /** Rendered device width, matching RackDevice's deviceWidth. */
  deviceWidth: number;
  /** The back of a full-depth device is in view, so the REAR tag shows. */
  isRearTreatment: boolean;
}

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
 * Greedy word wrap for SVG text, which cannot wrap on its own. Breaks only at
 * whitespace; a single word wider than the available width gets its own line.
 *
 * @param text - The text to wrap
 * @param availableWidth - The maximum line width in pixels
 * @param fontSize - The font size in pixels
 * @returns The wrapped lines, empty when the text has no words
 */
export function wrapText(
  text: string,
  availableWidth: number,
  fontSize: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && estimateTextWidth(candidate, fontSize) > availableWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
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

/**
 * Lays out a device's name label against its zones (#3450).
 *
 * With no visible ports the label stays centred in the device, as before.
 * With ports it starts at the label zone's left edge and stops short of the
 * port zone. On the back of a full-depth device the REAR tag then takes the
 * right end of the label zone, vertically centred, and the label gives up
 * that width so it never runs under the tag.
 */
export function computeDeviceLabelLayout(
  options: DeviceLabelLayoutOptions,
): DeviceLabelLayout {
  const { zones, deviceWidth, isRearTreatment } = options;

  if (zones.mode === "none") {
    return {
      x: deviceWidth / 2,
      anchor: "middle",
      availableWidth: zones.labelWidth,
    };
  }

  if (!isRearTreatment) {
    return {
      x: zones.labelX,
      anchor: "start",
      availableWidth: zones.labelWidth,
    };
  }

  return {
    x: zones.labelX,
    anchor: "start",
    availableWidth: Math.max(
      0,
      zones.labelWidth - REAR_TAG_WIDTH - REAR_TAG_GAP,
    ),
    rearTag: {
      // The label zone ends PORT_ZONE_GAP short of the port zone.
      x: zones.labelX + zones.labelWidth,
      y: zones.portZone.y + zones.portZone.height / 2,
    },
  };
}
