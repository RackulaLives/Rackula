/**
 * Layout version-migration helpers.
 *
 * Pure functions that the LayoutSchemaBase transform in schemas/index.ts wires
 * into Zod. Kept free of Zod schema definitions to avoid an import cycle with
 * schemas/index.ts: this module imports only leaf constants/helpers, and
 * index.ts imports these functions.
 */

import { UNITS_PER_U } from "$lib/types/constants";
import { heightToInternalUnits } from "$lib/utils/position";

/**
 * Current data-format version the running app reads and writes (MAJOR.MINOR).
 *
 * This is the schema_version, distinct from the app `version` (provenance, bumps
 * every release). A reader gates loadability strictly on the MAJOR component of a
 * document's metadata.schema_version against this constant. See the versioning
 * policy in docs/reference/SCHEMA.md (#1113).
 */
export const SCHEMA_VERSION = "1.0";

/** MAJOR component of a MAJOR.MINOR version string (untrusted-input safe). */
export function majorOf(version: string): number {
  const major = parseInt(version.trim().split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

/**
 * Reject a layout whose data-format MAJOR is newer than the running app (#2205).
 *
 * Gates strictly on the MAJOR of metadata.schema_version, never the app `version`
 * (which bumps every release and would over-reject). An absent schema_version is
 * treated as the current format (MAJOR matches), so legacy files predating
 * versioning load. Older MAJOR is not rejected here: it falls through to the
 * migration path. The check is read-only and non-destructive: it throws before
 * any parse or write so the original input is never modified.
 *
 * @param schemaVersion - The document's metadata.schema_version, if present.
 * @throws Error when the document MAJOR is newer than the app understands.
 */
export function assertSchemaVersionSupported(
  schemaVersion: string | undefined,
): void {
  // Absent schema_version reads as the current format (every file predating
  // versioning is the current MAJOR by construction).
  if (schemaVersion === undefined) {
    return;
  }
  if (majorOf(schemaVersion) > majorOf(SCHEMA_VERSION)) {
    throw new Error(
      `This layout was created by a newer version of Rackula (format ${schemaVersion}). ` +
        `Update Rackula to open it. Your file was not changed.`,
    );
  }
}

/**
 * Compare two semver version strings
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 * Note: Pre-release suffixes (e.g., -dev, -alpha.1) and build metadata are stripped
 */
export function compareVersions(a: string, b: string): number {
  // Strip pre-release (-dev, -alpha.1, etc.) and build metadata (+build)
  const stripSuffix = (v: string) => v.split(/[-+]/)[0] ?? v;
  const cleanA = stripSuffix(a.trim());
  const cleanB = stripSuffix(b.trim());

  const partsA = cleanA.split(".").map((p) => parseInt(p) || 0);
  const partsB = cleanB.split(".").map((p) => parseInt(p) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}

/**
 * Check if a layout needs position migration.
 * Uses two checks (belt and suspenders):
 * 1. Version < 0.7.0 (when internal units were introduced)
 * 2. Heuristic: any rack-level device with position < UNITS_PER_U
 */
export function needsPositionMigration(
  version: string | undefined,
  devices: { position: number; container_id?: string }[],
): boolean {
  // Check 1: Version-based detection
  // Layouts before 0.7.0 use old U-value positions
  if (!version || compareVersions(version, "0.7.0") < 0) {
    return true;
  }

  // Check 2: Heuristic fallback
  // If any rack-level device has position < UNITS_PER_U, it's old format
  // (U1 in new format = UNITS_PER_U, so valid positions are >= UNITS_PER_U)
  const hasOldFormatPosition = devices.some(
    (d) =>
      d.container_id === undefined &&
      d.position >= 1 &&
      d.position < UNITS_PER_U,
  );
  if (hasOldFormatPosition) {
    return true;
  }

  return false;
}

/**
 * Migrate device positions from old format to internal units
 * Old: position = U number (1, 2, 1.5)
 * New: position = internal units (6, 12)
 *
 * Carrier-first (#2158): rails register equipment at whole-U boundaries only,
 * so a legacy fractional U position (e.g. 1.5) snaps to the nearest whole U
 * during migration. This keeps every legacy load path (file, YAML, share)
 * valid against the whole-U schema enforcement; the store-ingress adapter then
 * wraps any sub-U / half-width gear in a carrier.
 *
 * Container children (with container_id) are NOT migrated since they use
 * 0-indexed positions relative to the container.
 */
export function migrateDevicePositions<
  T extends { position: number; container_id?: string },
>(devices: T[]): T[] {
  return devices.map((device) => {
    // Container children keep their 0-indexed positions
    if (device.container_id !== undefined) {
      return device;
    }
    // Rack-level devices: snap to the nearest whole U (min U1), in internal units.
    const wholeU = Math.max(1, Math.round(device.position));
    return {
      ...device,
      position: wholeU * UNITS_PER_U,
    } as T;
  });
}

/**
 * Clamp rail-mounted device positions that extend above the rack (#2661).
 *
 * LayoutSchema enforces the whole-U and carrier-first rules but never bounded a
 * rail position against rack.height, so a hand-edited or prior-release layout
 * with an over-rack position loaded and rendered outside the rack. This clamps
 * an overflowing rail device down to the highest within-rack whole-U position,
 * mirroring the maxValidTop check in canPlaceDevice (src/lib/utils/collision.ts).
 * Clamping (not hard-rejecting) keeps prior-release loading working, per the
 * project's supported-prior-data policy.
 *
 * Runs on every load, not only legacy migration: a modern layout stores positions
 * in internal units already, so its over-rack values never pass through
 * migrateDevicePositions. Container children (container_id set) use container-
 * relative positions and are left untouched.
 *
 * @param devices - Rack devices, positions already in internal units.
 * @param rackHeight - Rack height in whole U.
 * @param uHeightBySlug - Device-type u_height keyed by slug, for the fit math.
 */
export function clampOverRackPositions<
  T extends { position: number; device_type: string; container_id?: string },
>(devices: T[], rackHeight: number, uHeightBySlug: Map<string, number>): T[] {
  // Mirror canPlaceDevice: a device at P with height H occupies P..P+H*UPU-1,
  // and the highest valid top is UN's top = rackHeight*UPU + (UPU - 1).
  const maxValidTop = rackHeight * UNITS_PER_U + (UNITS_PER_U - 1);
  return devices.map((device) => {
    // Container children use container-relative positions; not rail-bounded.
    // A falsy container_id (undefined or "") is rack-level here, matching how
    // PlacedDeviceSchema and the carrier-first refine distinguish the two.
    if (device.container_id) {
      return device;
    }
    // Default to 1U when the type is unknown so the clamp still bounds the top.
    const uHeight = uHeightBySlug.get(device.device_type) ?? 1;
    const heightInternal = heightToInternalUnits(uHeight);
    const topPosition = device.position + heightInternal - 1;
    if (topPosition <= maxValidTop) {
      return device;
    }
    // Highest bottom position that keeps the top within the rack, snapped down
    // to a whole-U rail boundary and never below U1.
    const maxBottom = maxValidTop - heightInternal + 1;
    const clampedWholeU = Math.max(1, Math.floor(maxBottom / UNITS_PER_U));
    return {
      ...device,
      position: clampedWholeU * UNITS_PER_U,
    } as T;
  });
}
