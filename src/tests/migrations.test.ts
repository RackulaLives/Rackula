/**
 * Position-migration helper tests (#2699).
 *
 * The rest of the schema treats a falsy container_id (undefined or "") as
 * rack-level: PlacedDeviceSchema uses `!data.container_id`, the carrier-first
 * refine uses `if (!device.container_id)`, and clampOverRackPositions uses
 * `if (device.container_id)`. These helpers must agree, so a prior-release
 * device serialised with container_id "" is migrated like any other rail
 * device instead of being mistaken for a container child.
 */

import { describe, it, expect } from "vitest";
import {
  needsPositionMigration,
  migrateDevicePositions,
} from "$lib/schemas/migrations";
import { UNITS_PER_U } from "$lib/types/constants";

describe("migrateDevicePositions container_id semantics", () => {
  it("migrates a rack-level device whose container_id is an empty string", () => {
    // Legacy U position 5 must scale to internal units, not pass through.
    const [device] = migrateDevicePositions([
      { position: 5, container_id: "" },
    ]);
    expect(device.position).toBe(5 * UNITS_PER_U);
  });

  it("migrates a rack-level device whose container_id is undefined", () => {
    const [device] = migrateDevicePositions([{ position: 5 }]);
    expect(device.position).toBe(5 * UNITS_PER_U);
  });

  it("leaves a real container child unmigrated", () => {
    // A genuine container child keeps its 0-indexed container-relative position.
    const [device] = migrateDevicePositions([
      { position: 2, container_id: "container-1" },
    ]);
    expect(device.position).toBe(2);
  });
});

describe("needsPositionMigration container_id semantics", () => {
  it("detects old format via the heuristic when an empty-string container_id rail device sits below U1", () => {
    // Version >= 0.7.0 so check 1 does not short-circuit; the empty-string
    // device with a sub-UNITS_PER_U position must trip the heuristic.
    expect(
      needsPositionMigration("0.7.0", [{ position: 1, container_id: "" }]),
    ).toBe(true);
  });

  it("detects old format via the heuristic when container_id is undefined and a rail device sits below U1", () => {
    // Undefined container_id is also rack-level and must be treated the same
    // as an empty string by the migration heuristic.
    expect(needsPositionMigration("0.7.0", [{ position: 1 }])).toBe(true);
  });

  it("does not flag a real container child sitting at a low 0-indexed position", () => {
    // A genuine container child legitimately has a small position and must not
    // be misread as an old-format rail device.
    expect(
      needsPositionMigration("0.7.0", [
        { position: 1, container_id: "container-1" },
      ]),
    ).toBe(false);
  });
});
