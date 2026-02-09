/**
 * Brand Pack Index
 * Exports all brand-specific device packs
 */

import type { DeviceType, Airflow } from "$lib/types";
import { debug } from "$lib/utils/debug";
import { ubiquitiDevices } from "./ubiquiti";
import { mikrotikDevices } from "./mikrotik";
import { tplinkDevices } from "./tp-link";
import { synologyDevices } from "./synology";
import { apcDevices } from "./apc";
import { dellDevices } from "./dell";
import { supermicroDevices } from "./supermicro";
import { hpeDevices } from "./hpe";
// New brand packs
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
import { acInfinityDevices } from "./ac-infinity";
import { appleDevices } from "./apple";
import { ciscoDevices } from "./cisco";
import { aristaDevices } from "./arista";
import { juniperDevices } from "./juniper";
import { vertivDevices } from "./vertiv";

export {
  ubiquitiDevices,
  mikrotikDevices,
  tplinkDevices,
  synologyDevices,
  apcDevices,
  dellDevices,
  supermicroDevices,
  hpeDevices,
  // New brand packs
  fortinetDevices,
  eatonDevices,
  netgearDevices,
  paloaltoDevices,
  qnapDevices,
  lenovoDevices,
  cyberpowerDevices,
  netgateDevices,
  blackmagicdesignDevices,
  deskpiDevices,
  acInfinityDevices,
  appleDevices,
  ciscoDevices,
  aristaDevices,
  juniperDevices,
  vertivDevices,
};

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
 * Get all brand pack sections
 * Does not include the generic section (that comes from the layout store)
 */
export function getBrandPacks(): BrandSection[] {
  return [
    // Network Equipment
    {
      id: "ubiquiti",
      title: "Ubiquiti",
      devices: ubiquitiDevices,
      defaultExpanded: false,
      icon: "ubiquiti",
    },
    {
      id: "mikrotik",
      title: "MikroTik",
      devices: mikrotikDevices,
      defaultExpanded: false,
      icon: "mikrotik",
    },
    {
      id: "tp-link",
      title: "TP-Link",
      devices: tplinkDevices,
      defaultExpanded: false,
      icon: "tplink",
    },
    {
      id: "fortinet",
      title: "Fortinet",
      devices: fortinetDevices,
      defaultExpanded: false,
      icon: "fortinet",
    },
    {
      id: "netgear",
      title: "Netgear",
      devices: netgearDevices,
      defaultExpanded: false,
      icon: "netgear",
    },
    {
      id: "palo-alto",
      title: "Palo Alto",
      devices: paloaltoDevices,
      defaultExpanded: false,
      icon: "paloaltonetworks",
    },
    {
      id: "cisco",
      title: "Cisco",
      devices: ciscoDevices,
      defaultExpanded: false,
      icon: "cisco",
    },
    {
      id: "arista",
      title: "Arista",
      devices: aristaDevices,
      defaultExpanded: false,
      icon: "arista",
    },
    {
      id: "juniper",
      title: "Juniper",
      devices: juniperDevices,
      defaultExpanded: false,
      icon: "junipernetworks",
    },
    {
      id: "netgate",
      title: "Netgate",
      devices: netgateDevices,
      defaultExpanded: false,
      icon: "netgate",
    },
    // Storage
    {
      id: "synology",
      title: "Synology",
      devices: synologyDevices,
      defaultExpanded: false,
      icon: "synology",
    },
    {
      id: "qnap",
      title: "QNAP",
      devices: qnapDevices,
      defaultExpanded: false,
      icon: "qnap",
    },
    // Power
    {
      id: "apc",
      title: "APC",
      devices: apcDevices,
      defaultExpanded: false,
      icon: "schneiderelectric",
    },
    {
      id: "eaton",
      title: "Eaton",
      devices: eatonDevices,
      defaultExpanded: false,
      icon: "eaton",
    },
    {
      id: "vertiv",
      title: "Vertiv",
      devices: vertivDevices,
      defaultExpanded: false,
      icon: "vertiv",
    },
    {
      id: "cyberpower",
      title: "CyberPower",
      devices: cyberpowerDevices,
      defaultExpanded: false,
      icon: "cyberpower",
    },
    // Servers
    {
      id: "dell",
      title: "Dell",
      devices: dellDevices,
      defaultExpanded: false,
      icon: "dell",
    },
    {
      id: "supermicro",
      title: "Supermicro",
      devices: supermicroDevices,
      defaultExpanded: false,
      icon: "supermicro",
    },
    {
      id: "hpe",
      title: "HPE",
      devices: hpeDevices,
      defaultExpanded: false,
      icon: "hp",
    },
    {
      id: "lenovo",
      title: "Lenovo",
      devices: lenovoDevices,
      defaultExpanded: false,
      icon: "lenovo",
    },
    // AV/Media
    {
      id: "blackmagicdesign",
      title: "Blackmagic Design",
      devices: blackmagicdesignDevices,
      defaultExpanded: false,
      icon: "blackmagicdesign",
    },
    // Homelab Accessories
    {
      id: "deskpi",
      title: "DeskPi",
      devices: deskpiDevices,
      defaultExpanded: false,
      icon: "deskpi",
    },
    // Cooling
    {
      id: "ac-infinity",
      title: "AC Infinity",
      devices: acInfinityDevices,
      defaultExpanded: false,
      icon: "acinfinity",
    },
    // Servers - Apple
    {
      id: "apple",
      title: "Apple",
      devices: appleDevices,
      defaultExpanded: false,
      icon: "apple",
    },
  ];
}

/**
 * Get devices for a specific brand
 */
export function getBrandDevices(brandId: string): DeviceType[] {
  switch (brandId) {
    case "ubiquiti":
      return ubiquitiDevices;
    case "mikrotik":
      return mikrotikDevices;
    case "tp-link":
      return tplinkDevices;
    case "synology":
      return synologyDevices;
    case "apc":
      return apcDevices;
    case "dell":
      return dellDevices;
    case "supermicro":
      return supermicroDevices;
    case "hpe":
      return hpeDevices;
    case "fortinet":
      return fortinetDevices;
    case "eaton":
      return eatonDevices;
    case "netgear":
      return netgearDevices;
    case "palo-alto":
      return paloaltoDevices;
    case "qnap":
      return qnapDevices;
    case "lenovo":
      return lenovoDevices;
    case "cyberpower":
      return cyberpowerDevices;
    case "netgate":
      return netgateDevices;
    case "blackmagicdesign":
      return blackmagicdesignDevices;
    case "deskpi":
      return deskpiDevices;
    case "ac-infinity":
      return acInfinityDevices;
    case "apple":
      return appleDevices;
    case "cisco":
      return ciscoDevices;
    case "arista":
      return aristaDevices;
    case "juniper":
      return juniperDevices;
    case "vertiv":
      return vertivDevices;
    default:
      return [];
  }
}

/**
 * Get all devices from all brand packs as a single array
 * Used by findBrandDevice and getBrandSlugs to avoid duplication
 */
export function getAllBrandDevices(): DeviceType[] {
  return [
    ...ubiquitiDevices,
    ...mikrotikDevices,
    ...tplinkDevices,
    ...synologyDevices,
    ...apcDevices,
    ...dellDevices,
    ...supermicroDevices,
    ...hpeDevices,
    ...fortinetDevices,
    ...eatonDevices,
    ...netgearDevices,
    ...paloaltoDevices,
    ...qnapDevices,
    ...lenovoDevices,
    ...cyberpowerDevices,
    ...netgateDevices,
    ...blackmagicdesignDevices,
    ...deskpiDevices,
    ...acInfinityDevices,
    ...appleDevices,
    ...ciscoDevices,
    ...aristaDevices,
    ...juniperDevices,
    ...vertivDevices,
  ];
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
