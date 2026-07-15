/**
 * Brand Pack Index
 *
 * A brand pack is one vendor section in the device library. To add a new pack,
 * add a single entry to BRAND_PACK_REGISTRY below (alongside its import). The
 * palette sections, brand-icon slug lookups, the merged device list, and the
 * tests all derive from that registry. The one thing that does not is the icon
 * artwork: a new `icon` slug must also be added to the iconMap in
 * BrandIcon.svelte (or it renders the generic fallback).
 *
 * See docs/guides/BRAND-PACKS.md for the full contribution walkthrough.
 */

import type { DeviceType, Airflow } from "$lib/types";
import { debug } from "$lib/utils/debug";
import {
  compareNames,
  sortDevicesAlphabetically,
} from "$lib/utils/deviceFilters";
import { ubiquitiDevices } from "./ubiquiti";
import { mikrotikDevices } from "./mikrotik";
import { tplinkDevices } from "./tp-link";
import { synologyDevices } from "./synology";
import { apcDevices } from "./apc";
import { dellDevices } from "./dell";
import { supermicroDevices } from "./supermicro";
import { hpeDevices } from "./hpe";
import { fortinetDevices } from "./fortinet";
import { eatonDevices } from "./eaton";
import { netgearDevices } from "./netgear";
import { paloaltoDevices } from "./palo-alto";
import { qnapDevices } from "./qnap";
import { lenovoDevices } from "./lenovo";
import { cyberpowerDevices } from "./cyberpower";
import { netgateDevices } from "./netgate";
import { blackmagicdesignDevices } from "./blackmagicdesign";
import { deskpiDevices } from "./deskpi";
import { kwsDevices } from "./kws";
import { acInfinityDevices } from "./ac-infinity";
import { appleDevices } from "./apple";
import { ciscoDevices } from "./cisco";
import { aristaDevices } from "./arista";
import { juniperDevices } from "./juniper";
import { vertivDevices } from "./vertiv";
import { fsDevices } from "./fs";
import { intelDevices } from "./intel";
import { beelinkDevices } from "./beelink";
import { raspberryPiDevices } from "./raspberry-pi";
import { zimaDevices } from "./zima";

/**
 * Brand section data structure
 */
export interface BrandSection {
  id: string;
  title: string;
  devices: DeviceType[];
  defaultExpanded: boolean;
  /** simple-icons slug for brand logo, undefined for fallback icon */
  icon?: string;
}

/**
 * Single source of truth for brand packs. Each entry becomes one section in the
 * device library, and getAllBrandDevices()/getBrandSlugs()/getBrandIconSlug()
 * all derive from it. Adding a pack means adding one entry here (plus its
 * import); the only separate step is registering the `icon` slug in
 * BrandIcon.svelte's iconMap.
 *
 * Each `id` must be unique (it keys the palette's accordion sections); the
 * brandpacks test enforces this. Order in this array does not matter:
 * getBrandPacks() sorts sections A-Z by title and devices A-Z within each
 * section (#2723). The comment groupings are for humans scanning the file only.
 * defaultExpanded is false for every pack.
 */
const BRAND_PACK_REGISTRY: ReadonlyArray<
  Omit<BrandSection, "defaultExpanded">
> = [
  // Network
  {
    id: "ubiquiti",
    title: "Ubiquiti",
    devices: ubiquitiDevices,
    icon: "ubiquiti",
  },
  {
    id: "mikrotik",
    title: "MikroTik",
    devices: mikrotikDevices,
    icon: "mikrotik",
  },
  { id: "tp-link", title: "TP-Link", devices: tplinkDevices, icon: "tplink" },
  {
    id: "fortinet",
    title: "Fortinet",
    devices: fortinetDevices,
    icon: "fortinet",
  },
  { id: "netgear", title: "Netgear", devices: netgearDevices, icon: "netgear" },
  {
    id: "palo-alto",
    title: "Palo Alto",
    devices: paloaltoDevices,
    icon: "paloaltonetworks",
  },
  { id: "cisco", title: "Cisco", devices: ciscoDevices, icon: "cisco" },
  { id: "arista", title: "Arista", devices: aristaDevices, icon: "arista" },
  {
    id: "juniper",
    title: "Juniper",
    devices: juniperDevices,
    icon: "junipernetworks",
  },
  { id: "netgate", title: "Netgate", devices: netgateDevices, icon: "netgate" },
  { id: "fs", title: "FS.COM", devices: fsDevices, icon: "fs" },
  // Storage
  {
    id: "synology",
    title: "Synology",
    devices: synologyDevices,
    icon: "synology",
  },
  { id: "qnap", title: "QNAP", devices: qnapDevices, icon: "qnap" },
  // Power
  { id: "apc", title: "APC", devices: apcDevices, icon: "schneiderelectric" },
  { id: "eaton", title: "Eaton", devices: eatonDevices, icon: "eaton" },
  { id: "vertiv", title: "Vertiv", devices: vertivDevices, icon: "vertiv" },
  {
    id: "cyberpower",
    title: "CyberPower",
    devices: cyberpowerDevices,
    icon: "cyberpower",
  },
  // Servers
  { id: "dell", title: "Dell", devices: dellDevices, icon: "dell" },
  {
    id: "supermicro",
    title: "Supermicro",
    devices: supermicroDevices,
    icon: "supermicro",
  },
  { id: "hpe", title: "HPE", devices: hpeDevices, icon: "hp" },
  { id: "lenovo", title: "Lenovo", devices: lenovoDevices, icon: "lenovo" },
  { id: "apple", title: "Apple", devices: appleDevices, icon: "apple" },
  // AV/Media
  {
    id: "blackmagicdesign",
    title: "Blackmagic Design",
    devices: blackmagicdesignDevices,
    icon: "blackmagicdesign",
  },
  // Homelab Accessories
  { id: "deskpi", title: "DeskPi", devices: deskpiDevices, icon: "deskpi" },
  { id: "kws", title: "KWS", devices: kwsDevices, icon: "kws" },
  // Cooling
  {
    id: "ac-infinity",
    title: "AC Infinity",
    devices: acInfinityDevices,
    icon: "acinfinity",
  },
  // Mini PCs / SBCs
  { id: "intel", title: "Intel", devices: intelDevices, icon: "intel" },
  { id: "beelink", title: "Beelink", devices: beelinkDevices, icon: "beelink" },
  {
    id: "raspberry-pi",
    title: "Raspberry Pi",
    devices: raspberryPiDevices,
    icon: "raspberrypi",
  },
  { id: "zima", title: "Zima", devices: zimaDevices, icon: "zima" },
];

/**
 * Cached, ordered brand pack sections. Brand packs are static data, so the
 * sorted result is built once and reused (mirrors getAllBrandDevices). See #2723.
 */
let cachedBrandPacks: BrandSection[] | null = null;

/**
 * Get all brand pack sections
 * Does not include the generic section (that comes from the layout store)
 */
export function getBrandPacks(): BrandSection[] {
  if (cachedBrandPacks) {
    return cachedBrandPacks;
  }

  // Single source of truth for device-library ordering (#2723): brand sections
  // A-Z by title, devices A-Z (numeric-aware) within each section. The palette
  // consumes this pre-sorted, so it does not re-sort at render.
  cachedBrandPacks = BRAND_PACK_REGISTRY.map((section) => ({
    ...section,
    defaultExpanded: false,
    devices: sortDevicesAlphabetically(section.devices),
  })).sort((a, b) => compareNames(a.title, b.title));

  return cachedBrandPacks;
}

/**
 * Resolve the brand icon slug for a device by its slug, via the brand pack that
 * defines it. This matches the palette, which renders each pack's own icon, and
 * avoids brittle manufacturer-name matching (device `manufacturer` strings do
 * not always equal a pack `title`, e.g. "Blackmagicdesign" vs "Blackmagic
 * Design"). Returns undefined for devices not in any brand pack (generic or
 * custom), so BrandIcon falls back to its generic icon.
 */
export function getBrandIconSlug(deviceSlug?: string): string | undefined {
  if (!deviceSlug) return undefined;
  return getBrandPacks().find((p) =>
    p.devices.some((d) => d.slug === deviceSlug),
  )?.icon;
}

// Cached merged array of all brand devices (built once on first access)
let cachedBrandDevices: DeviceType[] | null = null;

/**
 * Get all devices from all brand packs as a single array
 * Used by findBrandDevice and getBrandSlugs to avoid duplication.
 * Brand packs are static data, so the merged array is built once and cached.
 */
export function getAllBrandDevices(): DeviceType[] {
  if (!cachedBrandDevices) {
    cachedBrandDevices = BRAND_PACK_REGISTRY.flatMap((pack) => pack.devices);
  }
  return cachedBrandDevices;
}

/**
 * Find a device by slug across all brand packs
 * @returns The DeviceType if found, undefined otherwise
 */
export function findBrandDevice(slug: string): DeviceType | undefined {
  return getAllBrandDevices().find((d) => d.slug === slug);
}

// Cached set of all brand device slugs
let brandSlugsCache: Set<string> | null = null;

// Track if we've already warned about duplicates (avoid spam in dev mode)
let duplicateWarningShown = false;

/**
 * Get a Set of all brand device slugs for fast lookup
 * Used to distinguish brand devices from custom devices
 *
 * Validates for duplicate slugs on first access and warns in development.
 */
export function getBrandSlugs(): Set<string> {
  if (!brandSlugsCache) {
    const devices = getAllBrandDevices();
    const slugs = new Set<string>();
    const duplicateSlugs = new Set<string>();

    for (const device of devices) {
      if (slugs.has(device.slug)) {
        duplicateSlugs.add(device.slug);
      } else {
        slugs.add(device.slug);
      }
    }

    // Warn about duplicates in development mode only
    if (
      duplicateSlugs.size > 0 &&
      !duplicateWarningShown &&
      import.meta.env.DEV
    ) {
      duplicateWarningShown = true;
      const uniqueDuplicates = Array.from(duplicateSlugs);
      debug.warn(
        "[Brand Packs] Duplicate device slugs detected (%d): %s. Duplicate slugs will cause incorrect device lookups.",
        uniqueDuplicates.length,
        uniqueDuplicates.join(", "),
      );
    }

    brandSlugsCache = slugs;
  }
  return brandSlugsCache;
}

/**
 * Default airflow direction used when a device doesn't specify one
 */
export const DEFAULT_AIRFLOW: Airflow = "front-to-rear";

/**
 * Get a device with normalized properties (airflow defaults applied)
 * Use this when you need consistent device properties for rendering/logic
 */
export function normalizeDevice(
  device: DeviceType,
): DeviceType & { airflow: Airflow } {
  return {
    ...device,
    airflow: device.airflow ?? DEFAULT_AIRFLOW,
  };
}

/**
 * Find a device by slug and return it with normalized properties
 * @returns The normalized DeviceType if found, undefined otherwise
 */
export function findBrandDeviceNormalized(
  slug: string,
): (DeviceType & { airflow: Airflow }) | undefined {
  const device = findBrandDevice(slug);
  return device ? normalizeDevice(device) : undefined;
}
