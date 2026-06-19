/**
 * Christmas Easter Egg Utilities
 * Only active on December 25 (local time)
 */

/**
 * Check if today is Christmas Day (December 25)
 * Uses local date to match user's timezone
 *
 * Debug: Add ?christmas=true to URL to force enable
 */
export function isChristmas(date: Date = new Date()): boolean {
  // Check URL param for testing (browser only)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("christmas") === "true") return true;
  }

  return date.getMonth() === 11 && date.getDate() === 25;
}
