// @ts-nocheck
/**
 * QR Code Generation Utilities
 * Fixed spec per Issue #88: Version 24, Error Correction L
 *
 * Note: QRCode library is dynamically imported to reduce initial bundle size.
 * The library is only loaded when generateQRCode() is first called.
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Fixed QR code version (per #88 decision)
 * Version 24 = 111x111 modules, ~1,588 alphanumeric char capacity
 */
export const QR_VERSION = 24;

/**
 * Error correction level (L = 7% recovery)
 * Lower error correction = more data capacity
 */
export const QR_ERROR_CORRECTION = "L" as const;

/**
 * Maximum chars that fit in QR v24 with EC level L
 * (alphanumeric mode for base64url data)
 */
export const QR_MAX_CHARS = 1588;

/**
 * Recommended minimum print size in cm
 * Version 24 = 111 modules, at 0.35mm/module = ~3.9cm
 */
export const QR_MIN_PRINT_CM = 4.0;

// =============================================================================
// QR Generation
// =============================================================================

export interface QRCodeOptions {
  /** Output width in pixels (default: 444 for high quality) */
  width?: number;
}

/**
 * Generate QR code as PNG data URL
 * Uses fixed Version 24, EC Level L for consistent sizing
 */
export async function generateQRCode(
  data: string,
  options: QRCodeOptions = {},
): Promise<string> {
  const { width = 444 } = options;

  // Dynamic import to avoid loading QRCode library on app startup
  const QRCode = await import("qrcode");

  return QRCode.toDataURL(data, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    version: QR_VERSION,
    width,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Check if data fits within QR Version 24 capacity
 */
export function canFitInQR(data: string): boolean {
  return data.length <= QR_MAX_CHARS;
}
