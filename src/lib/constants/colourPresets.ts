/**
 * Preset colours offered by ColourPicker.svelte for device colour overrides.
 *
 * These reuse the muted Dracula device-fill tokens from CATEGORY_COLOURS
 * (src/lib/types/constants.ts, BRAND.md "Device Visualization Palette") rather
 * than the raw bright Dracula accents: a device rendered with a preset colour
 * carries a white label (`.device-name { fill: var(--neutral-50) }` in
 * RackDevice.svelte), and the bright accents fail WCAG AA against that label
 * (#3005). Hex entry remains available in ColourPicker for anyone who wants
 * the brighter, non-preset values.
 *
 * Entries are limited to CATEGORY_COLOURS values that clear 4.5:1 against
 * neutral-50; see src/tests/colour-presets-contrast.test.ts for the computed
 * assertion this list must keep satisfying.
 */
export interface ColourPreset {
  name: string;
  hex: string;
}

export const COLOUR_PRESETS: ColourPreset[] = [
  { name: "Cyan", hex: "#4A7A8A" }, // muted server
  { name: "Pink", hex: "#A85A7A" }, // muted av-media
  { name: "Green", hex: "#3D7A4A" }, // muted storage
  { name: "Red", hex: "#A84A4A" }, // muted power
  { name: "Comment", hex: "#6272A4" }, // shelf / cable-management / patch-panel / other
  { name: "Blue", hex: "#5A6A8A" }, // muted chassis
  { name: "Dark", hex: "#44475A" }, // blank
  { name: "Alert", hex: "#C0392B" }, // firewall
];
