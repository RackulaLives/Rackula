/**
 * Snapshot filename pattern, shared by the filesystem storage layer and the
 * layout routes' input validation. Extracted from filesystem.ts (#2624) so the
 * routes can validate snapshot filenames without importing the filesystem
 * storage module.
 */

/** Matches a snapshot suffix: {base}~YYYYMMDD-HHMMSS[-N].yaml */
export const SNAPSHOT_NAME_PATTERN = /~(\d{8}-\d{6})(?:-(\d+))?\.yaml$/;
