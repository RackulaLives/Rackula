/**
 * Snapshot timestamp parsing and localized formatting (#2042).
 *
 * Snapshot filenames carry a UTC YYYYMMDD-HHMMSS suffix (Syncthing naming).
 * The LoadDialog renders these as localized timestamps in the browser's
 * timezone so users in non-UTC zones do not misread restore points by hours.
 */

/** Captures the UTC YYYYMMDD-HHMMSS suffix from a snapshot filename. */
const SNAPSHOT_TIMESTAMP_PATTERN = /~(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/;

/**
 * Parse the UTC timestamp suffix from a snapshot filename into a Date.
 * Returns null when the filename has no parseable suffix.
 */
export function parseSnapshotTimestamp(filename: string): Date | null {
  const match = SNAPSHOT_TIMESTAMP_PATTERN.exec(filename);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const ms = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a snapshot filename's UTC suffix as a localized timestamp string.
 * Falls back to the raw filename when the suffix cannot be parsed.
 */
export function formatSnapshotTimestamp(filename: string): string {
  const date = parseSnapshotTimestamp(filename);
  if (!date) {
    return filename;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
