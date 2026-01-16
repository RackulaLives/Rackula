/**
 * Icon Size Constants
 * Centralized values matching CSS tokens in tokens.css
 *
 * Use these instead of hardcoded pixel values in icon components.
 * This ensures consistency and makes global changes easier.
 */

export const ICON_SIZE = {
  sm: 16, // --icon-size-sm
  md: 20, // --icon-size-md
  lg: 24, // --icon-size-lg
  xl: 28, // --icon-size-xl
} as const;

export type IconSize = keyof typeof ICON_SIZE;
