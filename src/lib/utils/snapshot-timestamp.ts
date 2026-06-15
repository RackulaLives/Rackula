/**
 * Snapshot timestamp parsing and localized formatting (#2042).
 *
 * Snapshot filenames carry a UTC YYYYMMDD-HHMMSS suffix (Syncthing naming).
 * The LoadDialog renders these as localized timestamps in the browser's
 * timezone so users in non-UTC zones do not misread restore points by hours.
 */

/**
 * Captures the UTC YYYYMMDD-HHMMSS suffix from a snapshot filename, anchored to
 * the backend snapshot shape `...~YYYYMMDD-HHMMSS[-N].yaml`. Anchoring to the
 * filename tail keeps arbitrary embedded fragments from parsing as valid times.
 */
const SNAPSHOT_TIMESTAMP_PATTERN =
  /~(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?\.yaml$/;

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
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  const s = Number(second);

  // Date.UTC silently normalizes out-of-range components (month 13, day 32, ...)
  // into a different valid instant, so reject them explicitly rather than render
  // a misleading restore time.
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi ||
    date.getUTCSeconds() !== s
  ) {
    return null;
  }
  return date;
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
