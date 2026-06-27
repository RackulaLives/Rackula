/**
 * Format an ISO timestamp as elapsed time relative to now, for the storage chip
 * popover. Returns null for null or unparseable input so the caller can choose
 * its own copy (for example "Never exported"). Under 45 seconds (including small
 * future skew) it returns "just now". `nowMs` is injectable for deterministic
 * tests.
 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });

export function formatTimeAgo(
  iso: string | null,
  nowMs: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const elapsed = nowMs - then;
  const abs = Math.abs(elapsed);
  if (abs < 45 * SECOND) return "just now";
  if (abs < HOUR) return rtf.format(-Math.round(elapsed / MINUTE), "minute");
  if (abs < DAY) return rtf.format(-Math.round(elapsed / HOUR), "hour");
  return rtf.format(-Math.round(elapsed / DAY), "day");
}
