/**
 * Haptic feedback utilities for mobile interactions
 * Uses the Vibration API with graceful degradation
 */

/**
 * Vibration patterns (in milliseconds)
 * Single number = vibrate duration
 * Array = [vibrate, pause, vibrate, pause, ...]
 */
const PATTERNS = {
  /** Light tap feedback for UI interactions */
  tap: 50,
  /** Confirmation feedback for successful actions */
  success: 100,
  /** Error feedback pattern */
  error: [50, 50, 50] as const,
  /** Cancel/dismiss feedback */
  cancel: [25, 50, 25] as const,
} as const;

/**
 * Check if haptic feedback is supported on this device
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/**
 * Trigger vibration with the given pattern
 * Fails silently if not supported
 */
function vibrate(pattern: number | readonly number[]): void {
  if (isHapticSupported()) {
    try {
      // Cast needed: DOM types require mutable array but readonly is compatible
      navigator.vibrate(pattern as number | number[]);
    } catch {
      // Silently ignore errors (some browsers block vibration)
    }
  }
}

/**
 * Light tap feedback for UI interactions
 * Use when: selecting items, opening menus, tapping buttons
 */
export function hapticTap(): void {
  vibrate(PATTERNS.tap);
}

/**
 * Success feedback for completed actions
 * Use when: device placed successfully, save completed
 */
export function hapticSuccess(): void {
  vibrate(PATTERNS.success);
}

/**
 * Error feedback for invalid actions
 * Use when: placement blocked, validation failed
 */
export function hapticError(): void {
  vibrate(PATTERNS.error);
}

/**
 * Cancel feedback for dismissed actions
 * Use when: placement cancelled, modal closed
 */
export function hapticCancel(): void {
  vibrate(PATTERNS.cancel);
}
