/**
 * Build Time Utilities
 *
 * Provides functions for calculating and formatting the time since the last build.
 * Used by the dev environment indicator in the toolbar.
 */

/** Threshold in milliseconds after which a build is considered "stale" (1 hour) */
export const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Calculate the difference between two dates in a human-friendly format.
 * Returns compact relative time strings like "5m", "2h", "1d".
 *
 * @param buildTime - The build timestamp (ISO 8601 string or Date)
 * @param now - Current time (defaults to new Date())
 * @returns Compact relative time string
 */
export function formatRelativeTime(
  buildTime: string | Date,
  now: Date = new Date(),
): string {
  const buildDate =
    typeof buildTime === "string" ? new Date(buildTime) : buildTime;
  const diffMs = now.getTime() - buildDate.getTime();

  // Handle future dates (shouldn't happen, but be safe)
  if (diffMs < 0) {
    return "0s";
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Format a timestamp as a full, human-readable string for tooltips.
 *
 * @param buildTime - The build timestamp (ISO 8601 string or Date)
 * @returns Formatted date string (e.g., "Dec 30, 2025, 5:15 PM")
 */
export function formatFullTimestamp(buildTime: string | Date): string {
  const buildDate =
    typeof buildTime === "string" ? new Date(buildTime) : buildTime;

  return buildDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Check if a build is considered "stale" (older than the threshold).
 *
 * @param buildTime - The build timestamp (ISO 8601 string or Date)
 * @param now - Current time (defaults to new Date())
 * @param thresholdMs - Staleness threshold in ms (defaults to 1 hour)
 * @returns True if the build is stale
 */
export function isBuildStale(
  buildTime: string | Date,
  now: Date = new Date(),
  thresholdMs: number = STALE_THRESHOLD_MS,
): boolean {
  const buildDate =
    typeof buildTime === "string" ? new Date(buildTime) : buildTime;
  const diffMs = now.getTime() - buildDate.getTime();
  return diffMs >= thresholdMs;
}
