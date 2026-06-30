/**
 * Device library sorting (#2723)
 *
 * Guards consistent alphabetical ordering of the device library: devices sort
 * A-Z (numeric-aware) within a brand or category, categories follow the canonical
 * `categoryOrder`, and brand sections come out A-Z by title. These are behavioural
 * invariants, so asserting order with `.toEqual` on mapped arrays is intended.
 */

import { describe, it, expect } from "vitest";
import {
  compareNames,
  sortDevicesAlphabetically,
  sortDevicesByBrandThenModel,
  groupDevicesByCategoryOrdered,
} from "$lib/utils/deviceFilters";
import { getBrandPacks } from "$lib/data/brandPacks";
import { createTestDeviceType } from "./factories";

// Re-derive expected order with the same comparator the app ships, so the
// "sorted A-Z" invariants stay correct as data grows and never drift from
// the production ordering rule.
const byName = compareNames;

describe("sortDevicesAlphabetically", () => {
  it("orders devices A-Z by model name", () => {
    const devices = [
      createTestDeviceType({ slug: "z", model: "Zulu" }),
      createTestDeviceType({ slug: "a", model: "Alpha" }),
      createTestDeviceType({ slug: "b", model: "Bravo" }),
    ];
    const models = sortDevicesAlphabetically(devices).map((d) => d.model);
    expect(models).toEqual(["Alpha", "Bravo", "Zulu"]);
  });

  it("orders embedded model numbers naturally (numeric-aware)", () => {
    const devices = [
      createTestDeviceType({ slug: "a", model: "Switch 10" }),
      createTestDeviceType({ slug: "b", model: "Switch 2" }),
      createTestDeviceType({ slug: "c", model: "Switch 24" }),
    ];
    const models = sortDevicesAlphabetically(devices).map((d) => d.model);
    expect(models).toEqual(["Switch 2", "Switch 10", "Switch 24"]);
  });

  it("sorts case-insensitively", () => {
    const devices = [
      createTestDeviceType({ slug: "1", model: "ZEBRA" }),
      createTestDeviceType({ slug: "2", model: "apple" }),
      createTestDeviceType({ slug: "3", model: "Banana" }),
    ];
    const models = sortDevicesAlphabetically(devices).map((d) => d.model);
    expect(models).toEqual(["apple", "Banana", "ZEBRA"]);
  });

  it("falls back to slug when model is absent", () => {
    const devices = [
      createTestDeviceType({ slug: "zebra", model: null }),
      createTestDeviceType({ slug: "ant", model: null }),
      createTestDeviceType({ slug: "mule", model: null }),
    ];
    const slugs = sortDevicesAlphabetically(devices).map((d) => d.slug);
    expect(slugs).toEqual(["ant", "mule", "zebra"]);
  });

  it("does not mutate the input array", () => {
    const devices = [
      createTestDeviceType({ slug: "b", model: "Bravo" }),
      createTestDeviceType({ slug: "a", model: "Alpha" }),
    ];
    const before = devices.map((d) => d.model);
    sortDevicesAlphabetically(devices);
    expect(devices.map((d) => d.model)).toEqual(before);
  });
});

describe("sortDevicesByBrandThenModel", () => {
  it("orders by manufacturer A-Z, then model within each brand", () => {
    const devices = [
      createTestDeviceType({ slug: "1", manufacturer: "Dell", model: "R750" }),
      createTestDeviceType({
        slug: "2",
        manufacturer: "APC",
        model: "Smart-UPS",
      }),
      createTestDeviceType({ slug: "3", manufacturer: "Dell", model: "R650" }),
    ];
    const labels = sortDevicesByBrandThenModel(devices).map(
      (d) => `${d.manufacturer} ${d.model}`,
    );
    expect(labels).toEqual(["APC Smart-UPS", "Dell R650", "Dell R750"]);
  });

  it("orders model numbers naturally within a brand (numeric-aware)", () => {
    const devices = [
      createTestDeviceType({
        slug: "1",
        manufacturer: "Dell",
        model: "PowerEdge R6515",
      }),
      createTestDeviceType({
        slug: "2",
        manufacturer: "Dell",
        model: "PowerEdge R650",
      }),
      createTestDeviceType({
        slug: "3",
        manufacturer: "Dell",
        model: "PowerEdge R660",
      }),
    ];
    const models = sortDevicesByBrandThenModel(devices).map((d) => d.model);
    expect(models).toEqual([
      "PowerEdge R650",
      "PowerEdge R660",
      "PowerEdge R6515",
    ]);
  });

  it("falls back to slug within a brand when model is absent (numeric-aware)", () => {
    const devices = [
      createTestDeviceType({
        slug: "sw-10",
        manufacturer: "MikroTik",
        model: null,
      }),
      createTestDeviceType({
        slug: "sw-2",
        manufacturer: "MikroTik",
        model: null,
      }),
      createTestDeviceType({
        slug: "sw-24",
        manufacturer: "MikroTik",
        model: null,
      }),
    ];
    const slugs = sortDevicesByBrandThenModel(devices).map((d) => d.slug);
    expect(slugs).toEqual(["sw-2", "sw-10", "sw-24"]);
  });

  it("places devices without a manufacturer last", () => {
    const devices = [
      createTestDeviceType({ slug: "1", model: "Generic Shelf" }),
      createTestDeviceType({ slug: "2", manufacturer: "APC", model: "AP7900" }),
    ];
    const brands = sortDevicesByBrandThenModel(devices).map(
      (d) => d.manufacturer ?? "",
    );
    expect(brands).toEqual(["APC", ""]);
  });
});

describe("groupDevicesByCategoryOrdered", () => {
  it("returns categories in canonical order with devices sorted within", () => {
    const devices = [
      createTestDeviceType({ slug: "1", model: "Zeta", category: "power" }),
      createTestDeviceType({ slug: "2", model: "Alpha", category: "power" }),
      createTestDeviceType({ slug: "3", model: "Switch", category: "network" }),
      createTestDeviceType({ slug: "4", model: "Box", category: "server" }),
    ];
    const grouped = groupDevicesByCategoryOrdered(devices);

    expect(grouped.map(([category]) => category)).toEqual([
      "server",
      "network",
      "power",
    ]);

    const powerModels = grouped
      .find(([category]) => category === "power")?.[1]
      .map((d) => d.model);
    expect(powerModels).toEqual(["Alpha", "Zeta"]);
  });

  it("omits categories that have no devices", () => {
    const devices = [
      createTestDeviceType({ slug: "1", category: "server" }),
      createTestDeviceType({ slug: "2", category: "blank" }),
    ];
    const categories = groupDevicesByCategoryOrdered(devices).map(
      ([category]) => category,
    );
    expect(categories).toEqual(["server", "blank"]);
  });
});

describe("getBrandPacks ordering", () => {
  it("returns brand sections A-Z by title", () => {
    const titles = getBrandPacks().map((pack) => pack.title);
    expect(titles).toEqual([...titles].sort(byName));
  });

  it("sorts devices A-Z (numeric-aware) within every brand section", () => {
    for (const pack of getBrandPacks()) {
      const names = pack.devices.map((d) => d.model ?? d.slug);
      expect(names).toEqual([...names].sort(byName));
    }
  });
});
