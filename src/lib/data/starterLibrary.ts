/**
 * Starter Device Type Library
 * Generic rack devices for quick prototyping and universal fallbacks
 *
 * Total devices: 51 generic devices (no manufacturer)
 * - 43 full-width devices
 * - 8 half-width devices (slot_width: 1)
 * All branded devices have been moved to brandPacks/
 */

import type { DeviceType, DeviceCategory } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

interface StarterDeviceSpec {
  slug: string;
  model: string;
  u_height: number;
  category: DeviceCategory;
  is_full_depth?: boolean;
  /** Width in slots: 1 = half-width, 2 = full-width. Default: 2 */
  slot_width?: 1 | 2;
}

const STARTER_DEVICES: StarterDeviceSpec[] = [
  // Servers (4)
  { slug: "1u-server", model: "Server", u_height: 1, category: "server" },
  { slug: "2u-server", model: "Server", u_height: 2, category: "server" },
  { slug: "3u-server", model: "Server", u_height: 3, category: "server" },
  { slug: "4u-server", model: "Server", u_height: 4, category: "server" },

  // Network (4)
  {
    slug: "1u-router-firewall",
    model: "Router/Firewall",
    u_height: 1,
    category: "network",
  },
  {
    slug: "2u-router-firewall",
    model: "Router/Firewall",
    u_height: 2,
    category: "network",
  },
  {
    slug: "24-port-switch",
    model: "Switch (24-Port)",
    u_height: 1,
    category: "network",
  },
  {
    slug: "48-port-switch",
    model: "Switch (48-Port)",
    u_height: 1,
    category: "network",
  },

  // Storage (4)
  { slug: "1u-storage", model: "Storage", u_height: 1, category: "storage" },
  { slug: "2u-storage", model: "Storage", u_height: 2, category: "storage" },
  { slug: "3u-storage", model: "Storage", u_height: 3, category: "storage" },
  { slug: "4u-storage", model: "Storage", u_height: 4, category: "storage" },

  // Power (4)
  {
    slug: "1u-pdu",
    model: "PDU",
    u_height: 1,
    category: "power",
    is_full_depth: false,
  },
  {
    slug: "2u-pdu",
    model: "PDU",
    u_height: 2,
    category: "power",
    is_full_depth: false,
  },
  { slug: "2u-ups", model: "UPS", u_height: 2, category: "power" },
  { slug: "4u-ups", model: "UPS", u_height: 4, category: "power" },

  // Patch Panels (3)
  {
    slug: "1u-fiber-patch-panel",
    model: "Fiber Patch Panel",
    u_height: 1,
    category: "patch-panel",
    is_full_depth: false,
  },
  {
    slug: "24-port-patch-panel",
    model: "Patch Panel (24-Port)",
    u_height: 1,
    category: "patch-panel",
    is_full_depth: false,
  },
  {
    slug: "48-port-patch-panel",
    model: "Patch Panel (48-Port)",
    u_height: 2,
    category: "patch-panel",
    is_full_depth: false,
  },

  // KVM (2)
  {
    slug: "1u-console-drawer",
    model: "Console Drawer",
    u_height: 1,
    category: "kvm",
  },
  { slug: "1u-kvm", model: "KVM Switch", u_height: 1, category: "kvm" },

  // AV/Media (8)
  {
    slug: "1u-amplifier",
    model: "Amplifier",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "2u-amplifier",
    model: "Amplifier",
    u_height: 2,
    category: "av-media",
  },
  {
    slug: "1u-audio-processor",
    model: "Audio Processor",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "1u-av-receiver",
    model: "AV Receiver",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "2u-av-receiver",
    model: "AV Receiver",
    u_height: 2,
    category: "av-media",
  },
  {
    slug: "3u-power-amplifier",
    model: "Power Amplifier",
    u_height: 3,
    category: "av-media",
  },
  {
    slug: "1u-streaming-encoder",
    model: "Streaming Encoder",
    u_height: 1,
    category: "av-media",
  },
  {
    slug: "1u-video-switcher",
    model: "Video Switcher",
    u_height: 1,
    category: "av-media",
  },

  // Cooling (2)
  {
    slug: "1u-fan-panel",
    model: "Fan Panel",
    u_height: 1,
    category: "cooling",
    is_full_depth: false,
  },
  {
    slug: "2u-fan-panel",
    model: "Fan Panel",
    u_height: 2,
    category: "cooling",
    is_full_depth: false,
  },

  // Shelves (4)
  {
    slug: "1u-cantilever-shelf",
    model: "Cantilever Shelf",
    u_height: 1,
    category: "shelf",
    is_full_depth: false,
  },
  { slug: "1u-shelf", model: "Shelf", u_height: 1, category: "shelf" },
  { slug: "2u-shelf", model: "Shelf", u_height: 2, category: "shelf" },
  {
    slug: "1u-vented-shelf",
    model: "Vented Shelf",
    u_height: 1,
    category: "shelf",
  },

  // Blanks (5)
  {
    slug: "0-5u-blank",
    model: "Blank Panel",
    u_height: 0.5,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "1u-blank",
    model: "Blank Panel",
    u_height: 1,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "2u-blank",
    model: "Blank Panel",
    u_height: 2,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "3u-blank",
    model: "Blank Panel",
    u_height: 3,
    category: "blank",
    is_full_depth: false,
  },
  {
    slug: "4u-blank",
    model: "Blank Panel",
    u_height: 4,
    category: "blank",
    is_full_depth: false,
  },

  // Cable Management (3)
  {
    slug: "1u-brush-panel",
    model: "Brush Panel",
    u_height: 1,
    category: "cable-management",
    is_full_depth: false,
  },
  {
    slug: "1u-cable-manager",
    model: "Cable Manager",
    u_height: 1,
    category: "cable-management",
    is_full_depth: false,
  },
  {
    slug: "2u-cable-manager",
    model: "Cable Manager",
    u_height: 2,
    category: "cable-management",
    is_full_depth: false,
  },

  // Half-Width Devices (8) - slot_width: 1
  {
    slug: "1u-half-blank",
    model: "Half Blank Panel",
    u_height: 1,
    category: "blank",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "2u-half-blank",
    model: "Half Blank Panel",
    u_height: 2,
    category: "blank",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-shelf",
    model: "Half Shelf",
    u_height: 1,
    category: "shelf",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-patch-panel",
    model: "Half Patch Panel",
    u_height: 1,
    category: "patch-panel",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-switch",
    model: "Half Switch (8-Port)",
    u_height: 1,
    category: "network",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-brush-panel",
    model: "Half Brush Panel",
    u_height: 1,
    category: "cable-management",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-mini-ups",
    model: "Mini UPS",
    u_height: 1,
    category: "power",
    is_full_depth: false,
    slot_width: 1,
  },
  {
    slug: "1u-half-fan",
    model: "Half Fan Panel",
    u_height: 1,
    category: "cooling",
    is_full_depth: false,
    slot_width: 1,
  },
];

// Cache the transformed library
let cachedStarterLibrary: DeviceType[] | null = null;

/**
 * Get all starter library devices
 * Returns DeviceType[] with colors applied from category
 */
export function getStarterLibrary(): DeviceType[] {
  if (!cachedStarterLibrary) {
    cachedStarterLibrary = STARTER_DEVICES.map((spec) => ({
      slug: spec.slug,
      model: spec.model,
      u_height: spec.u_height,
      is_full_depth: spec.is_full_depth,
      slot_width: spec.slot_width ?? 2,
      colour: CATEGORY_COLOURS[spec.category],
      category: spec.category,
    }));
  }
  return cachedStarterLibrary;
}

/**
 * Find a starter device by slug
 */
export function findStarterDevice(slug: string): DeviceType | undefined {
  return getStarterLibrary().find((d) => d.slug === slug);
}

// Cache for starter slugs
let starterSlugsCache: Set<string> | null = null;

/**
 * Get a Set of all starter device slugs for fast lookup
 */
export function getStarterSlugs(): Set<string> {
  if (!starterSlugsCache) {
    starterSlugsCache = new Set(getStarterLibrary().map((d) => d.slug));
  }
  return starterSlugsCache;
}
