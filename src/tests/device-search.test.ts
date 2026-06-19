/**
 * Device Search Relevance Tests
 *
 * Guards two behaviours of `searchDevices` (Fuse.js fuzzy search) that have no
 * other coverage:
 *
 *  1. Typo tolerance — small misspellings of real device names still match.
 *  2. Cross-category precision — a query does NOT surface devices from an
 *     unrelated category (e.g. "Switch" / "Cable Manager" must not return a
 *     "Server").
 *
 * Tests run against the real combined library (starter + brand packs), which is
 * what the device palette searches. They reference device categories and small
 * typos of real model names rather than exact model strings, so adding or
 * renaming a single device does not break them (Zero-Change Rule).
 */

import { describe, it, expect } from "vitest";
import { searchDevices } from "$lib/utils/deviceFilters";
import { getStarterLibrary } from "$lib/data/starterLibrary";
import { getBrandPacks } from "$lib/data/brandPacks";
import type { DeviceType } from "$lib/types";

const library: DeviceType[] = [
  ...getStarterLibrary(),
  ...getBrandPacks().flatMap((pack) => pack.devices),
];

// Server detection uses the canonical category field only. Matching on the
// model string would misclassify non-server devices whose names contain
// "Server" (e.g. the network device "UniFi Application Server").
const isServer = (device: DeviceType): boolean => device.category === "server";

describe("searchDevices typo tolerance", () => {
  it("matches a switch despite a missing letter (Swith -> Switch)", () => {
    const results = searchDevices(library, "Swith");

    // At least one network switch is returned for the typo.
    expect(
      results.some((d) => d.category === "network" && /switch/i.test(d.model)),
    ).toBe(true);
  });

  it("matches servers despite a missing letter (Servr -> Server)", () => {
    const results = searchDevices(library, "Servr");

    expect(results.some(isServer)).toBe(true);
  });

  it("matches cable managers despite a typo (Cabel Manager -> Cable Manager)", () => {
    const results = searchDevices(library, "Cabel Manager");

    expect(
      results.some(
        (d) =>
          d.category === "cable-management" && /cable manager/i.test(d.model),
      ),
    ).toBe(true);
  });
});

describe("searchDevices cross-category precision", () => {
  it("returns switches but no server for 'Switch'", () => {
    const results = searchDevices(library, "Switch");

    // Positive: relevant switches are present.
    expect(
      results.some((d) => d.category === "network" && /switch/i.test(d.model)),
    ).toBe(true);

    // Negative: no unrelated server-category device leaks in.
    expect(results.some(isServer)).toBe(false);
  });

  it("returns cable managers but no server for 'Cable Manager'", () => {
    const results = searchDevices(library, "Cable Manager");

    // Positive: cable-management devices are present.
    expect(
      results.some(
        (d) =>
          d.category === "cable-management" && /cable manager/i.test(d.model),
      ),
    ).toBe(true);

    // Negative: no server leaks in.
    expect(results.some(isServer)).toBe(false);
  });

  it("returns only relevant categories for 'Cable Manager'", () => {
    const results = searchDevices(library, "Cable Manager");

    // Guard against a vacuous pass: `[].every(...)` is true, so an empty
    // result set would otherwise look like success.
    expect(results.length).toBeGreaterThan(0);

    // Every result should be cable-management related, not random categories.
    expect(results.every((d) => d.category === "cable-management")).toBe(true);
  });
});
