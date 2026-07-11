import type { Layout } from "$lib/types";
import { VERSION } from "$lib/version";
import { sessionDebug } from "$lib/utils/debug";
import {
  needsPositionMigration,
  migrateDevicePositions,
} from "$lib/schemas/migrations";

const log = sessionDebug.storage;

type RawDevice = { position: number; container_id?: string };

/**
 * Migrate legacy layout formats to current schema.
 * Handles:
 * - v0.6.x: rack (single) → racks[] (array)
 * - v0.6.x: position in U-values → internal units (×UNITS_PER_U)
 *
 * Shared by the legacy single-slot working copy and the multi-layout browser
 * store so every persisted body is normalised through one code path.
 *
 * Position migration (#2931) routes through the same needsPositionMigration +
 * migrateDevicePositions helpers the schema transform uses (schemas/
 * migrations.ts), so this path and the schema path can never diverge: both
 * apply the version/heuristic decision and the whole-U snap identically.
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
    let migratedAnyPosition = false;
    if (Array.isArray(raw.racks)) {
      const racks = raw.racks as Record<string, unknown>[];
      const allDevices = racks.flatMap((rack) =>
        Array.isArray(rack.devices) ? (rack.devices as RawDevice[]) : [],
      );

      const version = raw.version as string | undefined;
      if (needsPositionMigration(version, allDevices)) {
        for (const rack of racks) {
          if (Array.isArray(rack.devices)) {
            rack.devices = migrateDevicePositions(rack.devices as RawDevice[]);
          }
        }
        // Only stamp the version when a rack-level device actually existed to
        // rescale; an empty or container-children-only body has no position
        // data to protect from double-migration, so leave its version as is.
        migratedAnyPosition = allDevices.some((d) => !d.container_id);
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
