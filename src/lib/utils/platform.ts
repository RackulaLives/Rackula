/**
 * Platform detection utilities for keyboard shortcuts
 */

/**
 * Detect if running on macOS (including iOS)
 * SSR-safe: returns false when navigator is undefined
 */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Get platform-appropriate modifier key labels
 */
export function getModifierLabels(): {
  mod: string;
  alt: string;
  shift: string;
} {
  const mac = isMacOS();
  return {
    mod: mac ? "Cmd" : "Ctrl",
    alt: mac ? "Option" : "Alt",
    shift: "Shift",
  };
}

/**
 * Format a shortcut string with platform-appropriate modifiers
 * @example formatShortcut('mod', 'S') → 'Cmd + S' (Mac) or 'Ctrl + S' (Windows/Linux)
 * @example formatShortcut('mod', 'shift', 'Z') → 'Cmd + Shift + Z' (Mac)
 */
export function formatShortcut(...keys: string[]): string {
  const labels = getModifierLabels();
  return keys
    .map((k) => {
      if (k === "mod") return labels.mod;
      if (k === "alt") return labels.alt;
      if (k === "shift") return labels.shift;
      return k;
    })
    .join(" + ");
}
