/**
 * Image Upload Utilities (v0.1.0)
 * Functions for validating, processing, and converting device images
 */

import type { ImageData } from "$lib/types/images";
import {
  SUPPORTED_IMAGE_FORMATS,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
} from "$lib/types/constants";

/**
 * Result of image validation
 */
export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an image file for upload
 * Checks file type and size constraints
 */
export function validateImageFile(file: File): ImageValidationResult {
  // Check file type
  if (!SUPPORTED_IMAGE_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Supported: PNG, JPEG, WebP`,
    };
  }

  // Check file size
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum: ${MAX_IMAGE_SIZE_MB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Generate a standardized filename for a device image
 * Format: {deviceSlug}-{face}.{extension}
 */
export function generateImageFilename(
  deviceSlug: string,
  face: "front" | "rear",
  extension: string,
): string {
  return `${deviceSlug}-${face}.${extension}`;
}

/**
 * Sanitize a filename to prevent path traversal and other security issues
 * - Removes path separators and parent directory references
 * - Removes null bytes and control characters
 * - Limits length to prevent buffer issues
 * - Only allows alphanumeric, dash, underscore, and dot
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "";

  // Remove path separators and parent directory references
  let sanitized = filename
    .replace(/[/\\]/g, "") // Remove path separators
    .replace(/\.\./g, "") // Remove parent directory references
    .replace(/\0/g, ""); // Remove null bytes

  // Only keep safe characters: alphanumeric, dash, underscore, dot
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, "");

  // Limit length to 255 characters (common filesystem limit)
  sanitized = sanitized.slice(0, 255);

  // Ensure it doesn't start with a dot (hidden file)
  if (sanitized.startsWith(".")) {
    sanitized = sanitized.slice(1);
  }

  return sanitized;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

/**
 * Resize an image file while maintaining aspect ratio
 * Returns a new Blob with the resized image
 */
export function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate new dimensions maintaining aspect ratio
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const widthRatio = maxWidth / width;
        const heightRatio = maxHeight / height;
        const ratio = Math.min(widthRatio, heightRatio);

        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob from canvas"));
          }
        },
        file.type,
        0.9, // Quality for JPEG/WebP
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };

    img.src = objectUrl;
  });
}

/**
 * Convert a File to ImageData for storage
 * Reads the file and creates a data URL for display
 */
export function fileToImageData(
  file: File,
  deviceSlug: string,
  face: "front" | "rear",
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const extension = getExtensionFromMimeType(file.type);
      const filename = generateImageFilename(deviceSlug, face, extension);

      resolve({
        blob: file,
        dataUrl,
        filename,
      });
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}
