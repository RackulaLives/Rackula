import { describe, it, expect } from "vitest";
import {
  searchPaletteDevices,
  type PaletteDeviceSources,
} from "$lib/actions/palette-devices";
import { createTestDeviceType } from "./factories";

function sources(
  overrides: Partial<PaletteDeviceSources> = {},
): PaletteDeviceSources {
  return {
    starter: [],
    brandPackDevices: [],
    customDevices: [],
    ...overrides,
  };
}

describe("searchPaletteDevices", () => {
  it("reuses searchDevices: a query narrows the library by fuzzy match", () => {
    const src = sources({
      starter: [
        createTestDeviceType({ slug: "dell-r740", model: "PowerEdge R740" }),
        createTestDeviceType({ slug: "ubnt-sw", model: "UniFi Switch" }),
      ],
    });
    const results = searchPaletteDevices(src, "PowerEdge", 19, false);
    const slugs = results.map((d) => d.slug);
    expect(slugs).toContain("dell-r740");
    expect(slugs).not.toContain("ubnt-sw");
  });

  it("filters by active rack width when compatibleOnly is true", () => {
    const src = sources({
      starter: [
        createTestDeviceType({
          slug: "wide",
          model: "Wide",
          rack_widths: [23],
        }),
        createTestDeviceType({
          slug: "narrow",
          model: "Narrow",
          rack_widths: [19],
        }),
      ],
    });
    const compatible = searchPaletteDevices(src, "", 19, true).map(
      (d) => d.slug,
    );
    expect(compatible).toContain("narrow");
    expect(compatible).not.toContain("wide");

    const all = searchPaletteDevices(src, "", 19, false).map((d) => d.slug);
    expect(all).toContain("wide");
    expect(all).toContain("narrow");
  });

  it("combines starter, brand pack, and custom devices into one searchable pool", () => {
    const src = sources({
      starter: [createTestDeviceType({ slug: "s1", model: "Starter One" })],
      brandPackDevices: [
        createTestDeviceType({ slug: "b1", model: "Brand One" }),
      ],
      customDevices: [
        createTestDeviceType({ slug: "c1", model: "Custom One" }),
      ],
    });
    const slugs = searchPaletteDevices(src, "", 19, false).map((d) => d.slug);
    expect(slugs).toEqual(expect.arrayContaining(["s1", "b1", "c1"]));
  });

  it("custom devices shadow a starter device that shares its slug (no duplicate row)", () => {
    const src = sources({
      starter: [createTestDeviceType({ slug: "dup", model: "Starter Dup" })],
      customDevices: [
        createTestDeviceType({ slug: "dup", model: "Custom Dup" }),
      ],
    });
    const results = searchPaletteDevices(src, "", 19, false);
    const dupRows = results.filter((d) => d.slug === "dup");
    // eslint-disable-next-line no-restricted-syntax -- dedup invariant: one row per slug
    expect(dupRows).toHaveLength(1);
    expect(dupRows[0]?.model).toBe("Custom Dup");
  });
});
