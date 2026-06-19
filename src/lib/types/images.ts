/**
 * Device Image Types (v0.1.0)
 * Types for storing and managing device images
 */

/**
 * Supported image MIME types
 */
export type SupportedImageFormat = "image/png" | "image/jpeg" | "image/webp";

/**
 * Image data stored in memory during session
 *
 * Images can come from two sources:
 * 1. User uploads: blob + dataUrl (base64)
 * 2. Bundled images: url (Vite static asset URL)
 *
 * At least one of (blob + dataUrl) or url must be present.
 */
export interface ImageData {
  /** The image file as a Blob (for user uploads) */
  blob?: Blob;
  /** Data URL for displaying the image (base64 encoded, for user uploads) */
  dataUrl?: string;
  /** Static asset URL (for bundled images) */
  url?: string;
  /** Generated filename for the image (e.g., "server-1u-front.png") */
  filename: string;
  /** Whether this is a bundled image (not saved to archives) */
  isBundled?: boolean;
}

/**
 * Images for a device (front and rear views)
 */
export interface DeviceImageData {
  front?: ImageData;
  rear?: ImageData;
}

/**
 * Map of device IDs to their images
 */
export type ImageStoreMap = Map<string, DeviceImageData>;

/**
 * Result of an image upload operation
 */
export interface ImageUploadResult {
  /** Whether the upload was successful */
  success: boolean;
  /** Error message if upload failed */
  error?: string;
  /** The uploaded image data if successful */
  data?: ImageData;
}
