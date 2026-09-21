/**
 * Layout version-migration helpers.
 *
 * Pure functions that the LayoutSchemaBase transform in schemas/index.ts wires
 * into Zod. Kept free of Zod schema definitions to avoid an import cycle with
 * schemas/index.ts: this module imports only leaf constants/helpers, and
 * index.ts imports these functions.
 */

import type { DeviceType, Layout } from "$lib/types";
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
export const SCHEMA_VERSION = "1.1";

/**
 * Data-format version stamped on a layout that uses measured device widths
 * (DeviceType.width_mm, #3310). Releases before the field read a measured
 * device as full width and would reject its placement in a narrower cell, so
 * the field is a MAJOR change. It is stamped only when a layout uses it, so a
 * layout without measured devices stays readable by every 1.x release.
 */
export const MEASURED_WIDTH_SCHEMA_VERSION = "2.0";

/** MAJOR component of a MAJOR.MINOR version string (untrusted-input safe). */
export function majorOf(version: string): number {
  const major = parseInt(version.trim().split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : 0;
}

/** A well-formed MAJOR.MINOR schema_version: the only shape a reader accepts. */
const SCHEMA_VERSION_PATTERN = /^\d+\.\d+$/;

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
 * A stamp present but not shaped MAJOR.MINOR is refused before the MAJOR
 * comparison. parseInt reads a malformed stamp as MAJOR 0, so "2.O" (letter O)
 * would otherwise pass the newer-major check and then migrate as a legacy 1.x
 * document, reading its 2.x additions as this app's own format. Every writer
 * stamps MAJOR.MINOR digits (schemaVersionForWrite), so no file this app wrote
 * takes this path. MAJOR 0 stays readable: it is older, not malformed.
 *
 * @param schemaVersion - The document's metadata.schema_version, if present.
 * @throws Error when the stamp is malformed, or its MAJOR is newer than the app
 *   understands.
 */
export function assertSchemaVersionSupported(
  schemaVersion: string | undefined,
): void {
  // Absent schema_version reads as the current format (every file predating
  // versioning is the current MAJOR by construction).
  if (schemaVersion === undefined) {
    return;
  }
  if (!SCHEMA_VERSION_PATTERN.test(schemaVersion.trim())) {
    throw new Error(
      `This layout has an unreadable data format (${schemaVersion}). ` +
        `Expected a version such as 1.0. Your file was not changed.`,
    );
  }
  if (majorOf(schemaVersion) > majorOf(MEASURED_WIDTH_SCHEMA_VERSION)) {
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
 * The newest format this app fully understands for a given MAJOR, if it reads
 * that MAJOR at all. A stamp newer than this carries additions the app does not
 * know about, so a writer must not restamp it down (see schemaVersionForWrite).
 */
function knownVersionForMajor(major: number): string | undefined {
  if (major === majorOf(SCHEMA_VERSION)) return SCHEMA_VERSION;
  if (major === majorOf(MEASURED_WIDTH_SCHEMA_VERSION)) {
    return MEASURED_WIDTH_SCHEMA_VERSION;
  }
  return undefined;
}

/**
 * The schema_version a writer stamps on a saved layout (#3108).
 *
 * The base stamp is MEASURED_WIDTH_SCHEMA_VERSION when a device type has
 * width_mm, otherwise SCHEMA_VERSION. A layout re-saved after load and
 * migration is in the current format, so an older, absent, or malformed stamp
 * (anything but MAJOR.MINOR digits) becomes the base stamp. The base stamp
 * tracks the content, so dropping the last measured device restamps the file
 * back to SCHEMA_VERSION and a 1.x release can open it again.
 *
 * A stamp newer than the newest format this app knows for that MAJOR is kept
 * instead: unknown fields round-trip on save, so the file still carries that
 * format's additions and restamping it down would misdescribe it. Since the
 * read gate accepts two MAJORs (#3310), this is judged per MAJOR rather than
 * against the base alone, or a 2.x file saved without measured devices would be
 * stamped 1.x and a 1.x release would then read its unknown 2.x additions as
 * its own format. A kept stamp is never below the base, so a measured layout
 * cannot end up stamped 1.x. The shape check runs first because compareVersions
 * reads numeric prefixes, so "1.9x" would otherwise compare as newer.
 *
 * A MAJOR the app cannot read is restamped to the base. Every read door rejects
 * one (assertSchemaVersionSupported), so the body being written is always this
 * app's format; only a separately supplied stamp, such as archive entry
 * metadata, can carry it. Restamping instead of throwing keeps the layout
 * saveable.
 *
 * The stamp is trimmed first, as the read gate trims before judging it: a
 * padded stamp loads, so reading it untrimmed here would call it malformed and
 * restamp a newer format down while the body still carries its additions. The
 * trimmed form is what a kept stamp is written back as.
 *
 * @param current - The layout's metadata.schema_version, if any.
 * @param deviceTypes - The layout's device types, checked for width_mm.
 */
export function schemaVersionForWrite(
  current: string | undefined,
  deviceTypes: Pick<DeviceType, "width_mm">[],
): string {
  const base = deviceTypes.some((dt) => dt.width_mm !== undefined)
    ? MEASURED_WIDTH_SCHEMA_VERSION
    : SCHEMA_VERSION;
  const stamp = current?.trim();
  if (stamp === undefined || !SCHEMA_VERSION_PATTERN.test(stamp)) {
    return base;
  }
  const known = knownVersionForMajor(majorOf(stamp));
  return known !== undefined &&
    compareVersions(stamp, known) > 0 &&
    compareVersions(stamp, base) >= 0
    ? stamp
    : base;
}

/**
 * The layout a storage door should write, with metadata.schema_version stamped
 * for write (#3310).
 *
 * The file, archive and server doors stamp while building their own metadata
 * header. Browser storage writes the layout body verbatim, so without this the
 * stamp would stay at whatever createLayout set and a measured layout would sit
 * in localStorage claiming 1.x. A release without width_mm would then pass the
 * version gate and fail on the placement refinement instead of telling the user
 * to update, which is the outcome the measured-width MAJOR exists to prevent.
 *
 * A layout with no metadata section is written unchanged. LayoutMetadataSchema
 * requires id and name alongside schema_version, so inventing a stamp-only
 * section here would make the body fail validation on the way back in. Every
 * layout the app creates or loads carries metadata (createLayout sets it), so
 * this only spares the bodies that never had a section to stamp.
 *
 * Returns the layout unchanged when the stamp already matches, so an unchanged
 * body is not re-allocated on every autosave.
 */
export function stampLayoutForWrite(layout: Layout): Layout {
  if (layout.metadata === undefined) return layout;
  const schema_version = schemaVersionForWrite(
    layout.metadata.schema_version,
    layout.device_types,
  );
  if (layout.metadata.schema_version === schema_version) return layout;
  return { ...layout, metadata: { ...layout.metadata, schema_version } };
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
  // (U1 in new format = UNITS_PER_U, so valid positions are >= UNITS_PER_U).
  // A falsy container_id (undefined or "") is rack-level here, matching how
  // PlacedDeviceSchema, the carrier-first refine, and clampOverRackPositions
  // distinguish rail devices from container children.
  const hasOldFormatPosition = devices.some(
    (d) => !d.container_id && d.position >= 1 && d.position < UNITS_PER_U,
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
    // Container children keep their 0-indexed positions. A falsy container_id
    // (undefined or "") is rack-level here, matching PlacedDeviceSchema, the
    // carrier-first refine, and clampOverRackPositions.
    if (device.container_id) {
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
