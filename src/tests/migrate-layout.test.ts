/**
 * Parity between migrateLayout (browser localStorage read door) and the
 * schema transform's position-migration helpers (schemas/migrations.ts).
 *
 * migrateLayout used to decide "needs migration" on version alone and scale
 * every rack-level position by UNITS_PER_U with no whole-U snap, diverging
 * from the schema path's needsPositionMigration + migrateDevicePositions
 * (which snaps to the nearest whole U before scaling). A version-less body
 * with a fractional legacy-U position produced a sub-U internal position via
 * migrateLayout that the carrier-first refine rejects, while the schema path
 * produced a valid whole-U position for the identical input (#2931).
 */
import { describe, it, expect } from "vitest";
import { migrateLayout } from "$lib/storage/migrate-layout";
import { migrateDevicePositions } from "$lib/schemas/migrations";
import { UNITS_PER_U } from "$lib/types/constants";

/**
 * Build a raw localStorage layout body for the parity tests.
 *
 * Version-less by default (the "share-decoded layout that lost its version
 * metadata" shape from the issue); pass `version` only when a test needs one.
 * Pass `devices` to override the single default device (e.g. an empty rack).
 */
function rawLayout(
  overrides: {
    position?: number;
    container_id?: string;
    version?: string;
    devices?: Record<string, unknown>[];
  } = {},
): Record<string, unknown> {
  const { position = 0, container_id, version, devices } = overrides;
  const raw: Record<string, unknown> = {
    name: "Parity",
    racks: [
      {
        id: "rack-1",
        name: "Main",
        height: 42,
        width: 19,
        desc_units: false,
        form_factor: "4-post-cabinet",
        starting_unit: 1,
        position: 0,
        devices: devices ?? [
          {
            id: "d1",
            device_type: "server-1u",
            position,
            ...(container_id !== undefined ? { container_id } : {}),
            face: "front",
          },
        ],
      },
    ],
    device_types: [],
    settings: { display_mode: "label", show_labels_on_images: false },
  };
  if (version !== undefined) raw.version = version;
  return raw;
}

function firstDevicePosition(result: unknown): number {
  return (result as { racks: { devices: { position: number }[] }[] }).racks[0]!
    .devices[0]!.position;
}

describe("migrateLayout / schema position-migration parity (#2931)", () => {
  it("snaps a version-less body's fractional legacy-U position to the same whole-U value as migrateDevicePositions", () => {
    const result = migrateLayout(rawLayout({ position: 1.5 }));
    expect(result).not.toBeNull();

    // What schemas/migrations.ts produces for the identical raw position.
    const [expectedDevice] = migrateDevicePositions([
      { position: 1.5, container_id: undefined },
    ]);

    expect(firstDevicePosition(result)).toBe(expectedDevice!.position);
    // Whole-U snap: must land on a UNITS_PER_U boundary, never a sub-U
    // position the carrier-first refine would reject.
    expect(firstDevicePosition(result) % UNITS_PER_U).toBe(0);
  });

  it("migrates a rack-level device with an empty-string container_id the same as migrateDevicePositions", () => {
    // Empty-string container_id is rack-level, matching PlacedDeviceSchema,
    // the carrier-first refine, and clampOverRackPositions.
    const result = migrateLayout(rawLayout({ position: 5, container_id: "" }));
    expect(result).not.toBeNull();

    expect(firstDevicePosition(result)).toBe(5 * UNITS_PER_U);
  });

  it("does not stamp the current version when a rack has no rack-level devices to migrate", () => {
    // An old-versioned body with an empty rack has no position data to
    // protect from double-migration, so its version must be left untouched.
    const result = migrateLayout(rawLayout({ version: "0.6.0", devices: [] }));
    expect(result).not.toBeNull();

    expect((result as { version: string }).version).toBe("0.6.0");
  });
});
