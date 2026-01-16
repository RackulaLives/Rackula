/**
 * Rackula Constants
 * Based on spec.md Section 18.2 and other sections
 */

import type { DeviceCategory, RackView, DeviceFace } from "./index";

/**
 * Default colours for each device category
 * From BRAND.md v0.6.0 - Muted Dracula palette for WCAG AA compliance
 *
 * Active categories: Muted Dracula variants (desaturated/darkened for readability)
 * Passive categories: Dracula neutral colours for reduced visual noise
 */
export const CATEGORY_COLOURS: Record<DeviceCategory, string> = {
  // Active categories - Muted Dracula (WCAG AA compliant)
  server: "#4A7A8A", // muted cyan (4.8:1)
  network: "#7B6BA8", // muted purple (4.6:1)
  storage: "#3D7A4A", // muted green (5.2:1)
  power: "#A84A4A", // muted red (5.1:1)
  kvm: "#A87A4A", // muted orange (4.5:1)
  "av-media": "#A85A7A", // muted pink (4.7:1)
  cooling: "#8A8A4A", // muted yellow (4.6:1)

  // Passive categories - Dracula neutrals (unchanged)
  shelf: "#6272A4", // comment - utility
  blank: "#44475A", // selection - fades into background
  "cable-management": "#6272A4", // comment - utility
  "patch-panel": "#6272A4", // comment - passive infrastructure
  other: "#6272A4", // comment - generic fallback
} as const;

/**
 * All device categories for iteration
 */
export const ALL_CATEGORIES: readonly DeviceCategory[] = [
  "server",
  "network",
  "patch-panel",
  "power",
  "storage",
  "kvm",
  "av-media",
  "cooling",
  "shelf",
  "blank",
  "cable-management",
  "other",
] as const;

/**
 * Common rack heights for quick selection
 */
export const COMMON_RACK_HEIGHTS: readonly number[] = [12, 18, 24, 42] as const;

/**
 * Rack height constraints
 */
export const MIN_RACK_HEIGHT = 1;
export const MAX_RACK_HEIGHT = 100;

/**
 * Device height constraints
 */
export const MIN_DEVICE_HEIGHT = 0.5;
export const MAX_DEVICE_HEIGHT = 42;

/**
 * Number of internal units per rack unit (1U).
 * Positions are stored as multiples of 1/6U for precision.
 * 6 is the LCM of 2 and 3, supporting both 1/2U and 1/3U increments.
 */
export const UNITS_PER_U = 6;

/**
 * Maximum number of racks allowed per layout
 * v0.6.0: Multi-rack support enabled
 */
export const MAX_RACKS = 10;

/**
 * Current layout schema version
 */
export const CURRENT_VERSION = "1.1.0";

/**
 * Standard rack width in inches (19" rack)
 */
export const STANDARD_RACK_WIDTH = 19;

/**
 * Narrow rack width (10" rack)
 */
export const NARROW_RACK_WIDTH = 10;

/**
 * Broadcast/audio rack width (21" rack)
 */
export const BROADCAST_RACK_WIDTH = 21;

/**
 * Telco rack width (23" rack)
 */
export const TELCO_RACK_WIDTH = 23;

/**
 * Allowed rack widths
 */
export const ALLOWED_RACK_WIDTHS: readonly number[] = [10, 19, 21, 23] as const;

/**
 * Default rack view (front-facing)
 */
export const DEFAULT_RACK_VIEW: RackView = "front";

/**
 * Default device face (front-mounted)
 */
export const DEFAULT_DEVICE_FACE: DeviceFace = "front";

/**
 * Image Constants (v0.1.0)
 */

/**
 * Supported image MIME types for device images.
 *
 * SECURITY: SVG is intentionally excluded to prevent XSS attacks.
 * SVG files can contain embedded JavaScript that executes when rendered.
 * By only accepting raster formats, we avoid this attack vector entirely.
 * See: https://github.com/RackulaLives/Rackula/issues/102
 */
export const SUPPORTED_IMAGE_FORMATS: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/**
 * Maximum image file size in megabytes
 */
export const MAX_IMAGE_SIZE_MB = 5;

/**
 * Maximum image file size in bytes
 */
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

/**
 * Archive Constants (v0.1.0)
 */

/**
 * New archive file extension (.Rackula.zip)
 */
export const ARCHIVE_EXTENSION = ".Rackula.zip";

/**
 * Layout filename inside the archive
 */
export const LAYOUT_FILENAME = "layout.json";

/**
 * Images folder inside the archive
 */
export const IMAGES_FOLDER = "images";
