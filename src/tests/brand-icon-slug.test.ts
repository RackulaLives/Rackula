import { describe, it, expect } from "vitest";
import { getBrandIconSlug, getBrandPacks } from "$lib/data/brandPacks";

describe("getBrandIconSlug", () => {
  it("resolves a device slug to its brand-pack icon", () => {
    const applePack = getBrandPacks().find((p) => p.title === "Apple");
    const slug = applePack?.devices[0]?.slug;
    expect(slug).toBeDefined();
    expect(getBrandIconSlug(slug)).toBe(applePack?.icon);
  });

  it("uses the pack icon, not the manufacturer name (APC -> schneiderelectric)", () => {
    // APC's pack icon diverges from its title; resolving by slug returns the
    // registry icon regardless.
    const apcPack = getBrandPacks().find((p) => p.title === "APC");
    const slug = apcPack?.devices[0]?.slug;
    expect(slug).toBeDefined();
    expect(getBrandIconSlug(slug)).toBe(apcPack?.icon);
  });

  it("resolves brands whose manufacturer string differs from the pack title", () => {
    // Regression: device manufacturer "Blackmagicdesign" vs pack title
    // "Blackmagic Design" must still resolve (slug-based, not name-based).
    const bmPack = getBrandPacks().find((p) => p.id === "blackmagicdesign");
    const slug = bmPack?.devices[0]?.slug;
    expect(slug).toBeDefined();
    expect(getBrandIconSlug(slug)).toBe(bmPack?.icon);
  });

  it("returns undefined for a slug not in any brand pack", () => {
    expect(getBrandIconSlug("not-a-real-device-slug")).toBeUndefined();
  });

  it("returns undefined when no slug is given", () => {
    expect(getBrandIconSlug(undefined)).toBeUndefined();
    expect(getBrandIconSlug("")).toBeUndefined();
  });
});
