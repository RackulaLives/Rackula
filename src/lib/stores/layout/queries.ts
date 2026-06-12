/**
 * Layout Query Helpers
 *
 * Extracted from layout.svelte.ts - read-only derivations over the
 * current layout used for device-type bookkeeping (used/placed/unused).
 */

import type { DeviceType } from "$lib/types";
import { getStarterSlugs } from "$lib/data/starterLibrary";
import { getBrandSlugs } from "$lib/data/brandPacks";
import type { LayoutStateAccess } from "./types";

/**
 * Get all device type slugs currently in use
 */
export function getUsedDeviceTypeSlugs(ctx: LayoutStateAccess): Set<string> {
  const layout = ctx.getLayout();
  const slugs = new Set<string>();

  for (const dt of layout.device_types) {
    slugs.add(dt.slug);
  }

  for (const r of layout.racks) {
    for (const device of r.devices) {
      slugs.add(device.device_type);
    }
  }

  return slugs;
}

/**
 * Get device type slugs that are currently placed in any rack
 */
export function getPlacedDeviceTypeSlugs(ctx: LayoutStateAccess): Set<string> {
  const layout = ctx.getLayout();
  const slugs = new Set<string>();

  for (const r of layout.racks) {
    for (const device of r.devices) {
      slugs.add(device.device_type);
    }
  }

  return slugs;
}

/**
 * Get unused custom device types
 */
export function getUnusedCustomDeviceTypes(
  ctx: LayoutStateAccess,
): DeviceType[] {
  const starterSlugs = getStarterSlugs();
  const brandSlugs = getBrandSlugs();
  const placedSlugs = getPlacedDeviceTypeSlugs(ctx);

  return ctx.getLayout().device_types.filter((dt) => {
    if (starterSlugs.has(dt.slug)) return false;
    if (brandSlugs.has(dt.slug)) return false;
    if (placedSlugs.has(dt.slug)) return false;
    return true;
  });
}

/**
 * Check if a device type slug is a custom type (not starter or brand)
 */
export function isCustomDeviceType(slug: string): boolean {
  const starterSlugs = getStarterSlugs();
  const brandSlugs = getBrandSlugs();
  return !starterSlugs.has(slug) && !brandSlugs.has(slug);
}

/**
 * Check if a device type has any placements in any rack
 */
export function hasDeviceTypePlacements(
  ctx: LayoutStateAccess,
  slug: string,
): boolean {
  return getPlacedDeviceTypeSlugs(ctx).has(slug);
}
