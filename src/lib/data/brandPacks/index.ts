/**
 * Brand Pack Index
 * Exports all brand-specific device packs
 */

import type { DeviceType } from "$lib/types";
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
      id: "netgate",
      title: "Netgate",
      devices: netgateDevices,
      defaultExpanded: false,
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
      id: "cyberpower",
      title: "CyberPower",
      devices: cyberpowerDevices,
      defaultExpanded: false,
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

/**
 * Get a Set of all brand device slugs for fast lookup
 * Used to distinguish brand devices from custom devices
 */
export function getBrandSlugs(): Set<string> {
  if (!brandSlugsCache) {
    brandSlugsCache = new Set(getAllBrandDevices().map((d) => d.slug));
  }
  return brandSlugsCache;
}
