import type { Layout } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import { VERSION } from "$lib/version";
import { sessionDebug } from "$lib/utils/debug";

const log = sessionDebug.storage;

/**
 * Compare semver versions (simplified).
 * Handles pre-release suffixes like -dev, -alpha.1, etc.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
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
 * Migrate legacy layout formats to current schema.
 * Handles:
 * - v0.6.x: rack (single) → racks[] (array)
 * - v0.6.x: position in U-values → internal units (×UNITS_PER_U)
 *
 * Shared by the legacy single-slot working copy and the multi-layout browser
 * store so every persisted body is normalised through one code path.
 *
 * @param raw - Raw parsed JSON object from localStorage
 * @returns Migrated Layout object, or null if migration fails
 */
export function migrateLayout(raw: Record<string, unknown>): Layout | null {
  try {
    // Migration 1: rack → racks
    if ("rack" in raw && !("racks" in raw)) {
      const rack = raw.rack;
      // Validate rack is a proper object before migrating
      if (rack !== null && typeof rack === "object" && !Array.isArray(rack)) {
        raw.racks = [rack as Record<string, unknown>];
        delete raw.rack;
      }
    }

    // Migration 2: Position units (U-values → internal units)
    // Layouts before 0.7.0 used U-values (1, 2, 3...)
    // New format uses internal units (6, 12, 18...) where 1U = UNITS_PER_U units
    const version = (raw.version as string) || "0.0.0";
    const needsPositionMigration = compareVersions(version, "0.7.0") < 0;

    let migratedAnyPosition = false;
    if (needsPositionMigration && Array.isArray(raw.racks)) {
      for (const rack of raw.racks as Record<string, unknown>[]) {
        if (Array.isArray(rack.devices)) {
          for (const device of rack.devices as Record<string, unknown>[]) {
            // Only migrate rack-level devices (not container children)
            // Container children have container_id set and use 0-indexed positions
            if (
              device.container_id === undefined &&
              typeof device.position === "number"
            ) {
              device.position = Math.round(device.position * UNITS_PER_U);
              migratedAnyPosition = true;
            }
          }
        }
      }
    }

    // Stamp the current version once a position migration actually rescaled a
    // device, so re-running migrateLayout is idempotent. The multi-layout store
    // re-reads and re-migrates a body on every lazy load, so without this a
    // pre-0.7.0 position migration would re-apply each time and inflate
    // positions repeatedly. Layouts with nothing to rescale are left untouched.
    if (migratedAnyPosition) {
      raw.version = VERSION;
    }

    return raw as unknown as Layout;
  } catch (error) {
    log("migration failed: %O", error);
    return null;
  }
}
