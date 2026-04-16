#!/usr/bin/env npx tsx
/**
 * Bulk NetBox Device Import Script
 *
 * Imports device definitions from multiple NetBox vendors and generates
 * a complete starterLibrary.ts file with 500+ devices.
 *
 * Usage:
 *   npx tsx scripts/bulk-import-netbox.ts
 *   npx tsx scripts/bulk-import-netbox.ts --dry-run
 *   npx tsx scripts/bulk-import-netbox.ts --stats
 */

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

// NetBox repository URLs
const NETBOX_RAW_BASE =
  "https://raw.githubusercontent.com/netbox-community/devicetype-library/master";
const NETBOX_API_BASE =
  "https://api.github.com/repos/netbox-community/devicetype-library/contents";

// Output paths
const STARTER_LIBRARY_PATH = join(ROOT_DIR, "src/lib/data/starterLibrary.ts");
const ASSETS_SOURCE_DIR = join(ROOT_DIR, "assets-source", "device-images");

// Rate limiting
const RATE_LIMIT_DELAY = 100; // ms between API calls

// Vendor configurations with category inference hints
interface VendorConfig {
  name: string;
  defaultCategory: DeviceCategory;
  filter?: (device: NetBoxDevice) => boolean;
  categoryOverrides?: Record<string, DeviceCategory>;
}

type DeviceCategory =
  | "server"
  | "network"
  | "patch-panel"
  | "power"
  | "storage"
  | "kvm"
  | "av-media"
  | "cooling"
  | "shelf"
  | "blank"
  | "cable-management"
  | "other";

// Vendors to import, organized by priority
const VENDORS: VendorConfig[] = [
  // Networking - High Priority
  {
    name: "Ubiquiti",
    defaultCategory: "network",
    filter: (d) => d.u_height >= 1 && !d.model.toLowerCase().includes("camera"),
  },
  {
    name: "MikroTik",
    defaultCategory: "network",
    filter: (d) => d.u_height >= 1,
  },
  {
    name: "TP-Link",
    defaultCategory: "network",
    filter: (d) => d.u_height >= 1,
  },
  {
    name: "Netgate",
    defaultCategory: "network",
  },
  {
    name: "Netgear",
    defaultCategory: "network",
    filter: (d) => d.u_height >= 1,
  },

  // Servers - High Priority
  {
    name: "Dell",
    defaultCategory: "server",
    filter: (d) =>
      d.u_height >= 1 &&
      (d.model.includes("PowerEdge") || d.model.includes("PowerVault")),
  },
  {
    name: "HPE",
    defaultCategory: "server",
    filter: (d) =>
      d.u_height >= 1 &&
      (d.model.includes("ProLiant") ||
        d.model.includes("Aruba") ||
        d.model.includes("Apollo")),
  },
  {
    name: "Supermicro",
    defaultCategory: "server",
    filter: (d) => d.u_height >= 1,
  },

  // NAS/Storage - High Priority
  {
    name: "Synology",
    defaultCategory: "storage",
    filter: (d) => d.u_height >= 1,
  },
  {
    name: "QNAP",
    defaultCategory: "storage",
    filter: (d) => d.u_height >= 1,
  },

  // Power - High Priority
  {
    name: "APC",
    defaultCategory: "power",
    filter: (d) => d.u_height >= 1,
  },
  {
    name: "CyberPower",
    defaultCategory: "power",
    filter: (d) => d.u_height >= 1,
  },
  {
    name: "Eaton",
    defaultCategory: "power",
    filter: (d) => d.u_height >= 1,
  },
  {
    name: "Vertiv",
    defaultCategory: "power",
    filter: (d) => d.u_height >= 1,
  },

  // AV/Broadcast
  {
    name: "Blackmagicdesign",
    defaultCategory: "av-media",
    filter: (d) => d.u_height >= 1,
  },

  // Additional Networking - Curated enterprise (only popular models)
  {
    name: "Arista",
    defaultCategory: "network",
    filter: (d) =>
      d.u_height >= 1 &&
      // Only 7000 series data center switches (popular in homelabs)
      (d.model.includes("7050") ||
        d.model.includes("7060") ||
        d.model.includes("7280") ||
        d.model.includes("7020")),
  },
  {
    name: "Cisco",
    defaultCategory: "network",
    filter: (d) =>
      d.u_height >= 1 &&
      // Only popular Catalyst switches and ISR routers
      (d.model.includes("Catalyst 9") ||
        d.model.includes("Catalyst 3") ||
        d.model.includes("Catalyst 2") ||
        d.model.includes("ISR 4") ||
        d.model.includes("Nexus 9") ||
        d.model.includes("ASA 55")),
  },
  {
    name: "Juniper",
    defaultCategory: "network",
    filter: (d) =>
      d.u_height >= 1 &&
      // Only popular EX and SRX series
      (d.model.includes("EX2") ||
        d.model.includes("EX3") ||
        d.model.includes("EX4") ||
        d.model.includes("SRX3") ||
        d.model.includes("SRX1")),
  },

  // Additional Servers
  {
    name: "Lenovo",
    defaultCategory: "server",
    filter: (d) => d.u_height >= 1 && d.model.includes("ThinkSystem"),
  },

  // Security/Firewalls - Curated
  {
    name: "Fortinet",
    defaultCategory: "network",
    filter: (d) =>
      d.u_height >= 1 &&
      // Only FortiGate firewalls (popular in homelab)
      d.model.includes("FortiGate"),
  },
  {
    name: "Palo Alto",
    defaultCategory: "network",
    filter: (d) =>
      d.u_height >= 1 &&
      // Only PA series firewalls
      d.model.includes("PA-"),
  },
  {
    name: "SonicWall",
    defaultCategory: "network",
    filter: (d) => d.u_height >= 1 && d.model.includes("NSa"),
  },
];

interface NetBoxDevice {
  manufacturer: string;
  model: string;
  slug: string;
  u_height: number;
  is_full_depth?: boolean;
  front_image?: boolean;
  rear_image?: boolean;
  airflow?: string;
  weight?: number;
  weight_unit?: string;
  subdevice_role?: string;
  comments?: string;
  part_number?: string;
}

interface ImportedDevice {
  slug: string;
  manufacturer: string;
  model: string;
  u_height: number;
  is_full_depth: boolean;
  category: DeviceCategory;
  airflow?: string;
  front_image?: boolean;
  rear_image?: boolean;
}

interface ImportStats {
  vendor: string;
  total: number;
  imported: number;
  skipped: number;
}

// Sleep function for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  await sleep(RATE_LIMIT_DELAY);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Rackula-Bulk-Import",
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      console.log("Rate limited, waiting 60s...");
      await sleep(60000);
      return fetchJson(url);
    }
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  await sleep(RATE_LIMIT_DELAY);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Rackula-Bulk-Import",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function listVendorDevices(vendor: string): Promise<string[]> {
  const url = `${NETBOX_API_BASE}/device-types/${vendor}`;
  try {
    const files = await fetchJson<Array<{ name: string }>>(url);
    return files
      .filter((f) => f.name.endsWith(".yaml"))
      .map((f) => f.name.replace(".yaml", ""));
  } catch {
    console.log(`  ⚠️ Could not list devices for ${vendor}`);
    return [];
  }
}

async function fetchDeviceYaml(
  vendor: string,
  deviceSlug: string,
): Promise<NetBoxDevice | null> {
  const url = `${NETBOX_RAW_BASE}/device-types/${vendor}/${deviceSlug}.yaml`;
  try {
    const yamlText = await fetchText(url);
    return yaml.load(yamlText) as NetBoxDevice;
  } catch {
    return null;
  }
}

function inferCategory(
  device: NetBoxDevice,
  vendorConfig: VendorConfig,
): DeviceCategory {
  const model = device.model.toLowerCase();
  const slug = device.slug.toLowerCase();

  // Check vendor-specific overrides first
  if (vendorConfig.categoryOverrides) {
    for (const [pattern, category] of Object.entries(
      vendorConfig.categoryOverrides,
    )) {
      if (
        model.includes(pattern.toLowerCase()) ||
        slug.includes(pattern.toLowerCase())
      ) {
        return category;
      }
    }
  }

  // Universal pattern matching
  if (model.includes("pdu") || slug.includes("pdu")) return "power";
  if (model.includes("ups") || slug.includes("ups")) return "power";
  if (model.includes("patch") && model.includes("panel")) return "patch-panel";
  if (model.includes("switch") || slug.includes("switch")) return "network";
  if (model.includes("router") || slug.includes("router")) return "network";
  if (model.includes("firewall")) return "network";
  if (model.includes("gateway")) return "network";
  if (
    model.includes("nas") ||
    model.includes("diskstation") ||
    model.includes("rackstation")
  )
    return "storage";
  if (model.includes("powervault") || model.includes("storage"))
    return "storage";
  if (model.includes("kvm") || model.includes("console")) return "kvm";
  if (
    model.includes("atem") ||
    model.includes("receiver") ||
    model.includes("amplifier")
  )
    return "av-media";

  return vendorConfig.defaultCategory;
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Rackula-Bulk-Import" },
    });
    if (!response.ok) return false;

    const buffer = await response.arrayBuffer();
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

async function importVendorDevices(
  vendorConfig: VendorConfig,
  dryRun: boolean,
): Promise<{ devices: ImportedDevice[]; stats: ImportStats }> {
  console.log(`\n📦 ${vendorConfig.name}`);
  console.log(`${"─".repeat(40)}`);

  const deviceSlugs = await listVendorDevices(vendorConfig.name);
  console.log(`  Found ${deviceSlugs.length} device files`);

  const importedDevices: ImportedDevice[] = [];
  let skipped = 0;

  for (const slug of deviceSlugs) {
    const device = await fetchDeviceYaml(vendorConfig.name, slug);
    if (!device) {
      skipped++;
      continue;
    }

    // Apply vendor filter
    if (vendorConfig.filter && !vendorConfig.filter(device)) {
      skipped++;
      continue;
    }

    // Skip non-rackmount devices
    if (device.u_height < 1) {
      skipped++;
      continue;
    }

    // Skip blade/child devices
    if (device.subdevice_role === "child") {
      skipped++;
      continue;
    }

    const category = inferCategory(device, vendorConfig);

    const imported: ImportedDevice = {
      slug: device.slug,
      manufacturer: device.manufacturer,
      model: device.model,
      u_height: device.u_height,
      is_full_depth: device.is_full_depth ?? true,
      category,
      airflow: device.airflow,
      front_image: device.front_image,
      rear_image: device.rear_image,
    };

    importedDevices.push(imported);

    // Download images if not dry run
    if (!dryRun && (device.front_image || device.rear_image)) {
      const vendorLower = vendorConfig.name.toLowerCase();
      const destDir = join(ASSETS_SOURCE_DIR, vendorLower);

      if (device.front_image) {
        const frontDest = join(destDir, `${device.slug}.front.png`);
        if (!existsSync(frontDest)) {
          const frontUrl = `${NETBOX_RAW_BASE}/elevation-images/${vendorConfig.name}/${device.slug}.front.png`;
          await downloadImage(frontUrl, frontDest);
        }
      }
      if (device.rear_image) {
        const rearDest = join(destDir, `${device.slug}.rear.png`);
        if (!existsSync(rearDest)) {
          const rearUrl = `${NETBOX_RAW_BASE}/elevation-images/${vendorConfig.name}/${device.slug}.rear.png`;
          await downloadImage(rearUrl, rearDest);
        }
      }
    }
  }

  console.log(`  ✅ Imported: ${importedDevices.length}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);

  return {
    devices: importedDevices,
    stats: {
      vendor: vendorConfig.name,
      total: deviceSlugs.length,
      imported: importedDevices.length,
      skipped,
    },
  };
}

function generateStarterLibrary(
  brandedDevices: ImportedDevice[],
  genericDevices: ImportedDevice[],
): string {
  const allDevices = [...genericDevices, ...brandedDevices];

  // Group by category for organization
  const byCategory = new Map<DeviceCategory, ImportedDevice[]>();
  for (const device of allDevices) {
    const list = byCategory.get(device.category) || [];
    list.push(device);
    byCategory.set(device.category, list);
  }

  // Sort devices within each category
  for (const devices of byCategory.values()) {
    devices.sort((a, b) => {
      // Generic devices first, then by manufacturer, then by model
      const aIsGeneric = !a.manufacturer || a.manufacturer === "Generic";
      const bIsGeneric = !b.manufacturer || b.manufacturer === "Generic";
      if (aIsGeneric !== bIsGeneric) return aIsGeneric ? -1 : 1;
      if (a.manufacturer !== b.manufacturer) {
        return (a.manufacturer || "").localeCompare(b.manufacturer || "");
      }
      return a.model.localeCompare(b.model);
    });
  }

  const categoryOrder: DeviceCategory[] = [
    "server",
    "network",
    "storage",
    "power",
    "patch-panel",
    "kvm",
    "av-media",
    "cooling",
    "shelf",
    "blank",
    "cable-management",
    "other",
  ];

  let deviceEntries = "";
  for (const category of categoryOrder) {
    const devices = byCategory.get(category);
    if (!devices || devices.length === 0) continue;

    deviceEntries += `\n\t// ${getCategoryLabel(category)} (${devices.length})\n`;

    for (const device of devices) {
      deviceEntries += generateDeviceEntry(device);
    }
  }

  return `/**
 * Starter Device Type Library
 * Generated from NetBox Community Device Type Library
 * https://github.com/netbox-community/devicetype-library
 *
 * Total devices: ${allDevices.length}
 * Generated: ${new Date().toISOString().split("T")[0]}
 */

import type { DeviceType, DeviceCategory } from '$lib/types';
import { CATEGORY_COLOURS } from '$lib/types/constants';

interface StarterDeviceSpec {
	slug: string;
	manufacturer?: string;
	model: string;
	u_height: number;
	category: DeviceCategory;
	is_full_depth?: boolean;
	airflow?: string;
	front_image?: boolean;
	rear_image?: boolean;
	va_rating?: number;
}

const STARTER_DEVICES: StarterDeviceSpec[] = [${deviceEntries}
];

// Cached starter library (computed once)
let cachedStarterLibrary: DeviceType[] | null = null;

/**
 * Get the starter device type library
 * These are the default device types available in a new layout
 * Returns a cached copy for performance (called frequently by DevicePalette)
 */
export function getStarterLibrary(): DeviceType[] {
	if (!cachedStarterLibrary) {
		cachedStarterLibrary = STARTER_DEVICES.map((spec) => ({
			slug: spec.slug,
			u_height: spec.u_height,
			manufacturer: spec.manufacturer,
			model: spec.model,
			is_full_depth: spec.is_full_depth,
			airflow: spec.airflow as DeviceType['airflow'],
			front_image: spec.front_image,
			rear_image: spec.rear_image,
			va_rating: spec.va_rating,
			colour: CATEGORY_COLOURS[spec.category],
			category: spec.category
		}));
	}
	return cachedStarterLibrary;
}

/**
 * Find a device type in the starter library by slug
 * Used for auto-importing starter devices when placed
 */
export function findStarterDevice(slug: string): DeviceType | undefined {
	return getStarterLibrary().find((d) => d.slug === slug);
}

/**
 * Get set of all starter library slugs for efficient lookup
 */
export function getStarterSlugs(): Set<string> {
	return new Set(getStarterLibrary().map((d) => d.slug));
}
`;
}

function getCategoryLabel(category: DeviceCategory): string {
  const labels: Record<DeviceCategory, string> = {
    server: "Servers",
    network: "Networking",
    storage: "Storage/NAS",
    power: "Power",
    "patch-panel": "Patch Panels",
    kvm: "KVM/Console",
    "av-media": "AV/Media",
    cooling: "Cooling",
    shelf: "Shelves",
    blank: "Blanks",
    "cable-management": "Cable Management",
    other: "Other",
  };
  return labels[category] || category;
}

function generateDeviceEntry(device: ImportedDevice): string {
  const parts: string[] = [];

  parts.push(`slug: '${device.slug}'`);
  if (device.manufacturer) {
    parts.push(`manufacturer: '${escapeString(device.manufacturer)}'`);
  }
  parts.push(`model: '${escapeString(device.model)}'`);
  parts.push(`u_height: ${device.u_height}`);
  parts.push(`category: '${device.category}'`);

  if (device.is_full_depth === false) {
    parts.push(`is_full_depth: false`);
  }
  if (device.airflow) {
    parts.push(`airflow: '${device.airflow}'`);
  }
  if (device.front_image) {
    parts.push(`front_image: true`);
  }
  if (device.rear_image) {
    parts.push(`rear_image: true`);
  }

  return `\t{ ${parts.join(", ")} },\n`;
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Generic devices to keep from existing library
function getGenericDevices(): ImportedDevice[] {
  return [
    // Servers - generic
    {
      slug: "1u-server",
      model: "Server",
      u_height: 1,
      is_full_depth: true,
      category: "server",
    },
    {
      slug: "2u-server",
      model: "Server",
      u_height: 2,
      is_full_depth: true,
      category: "server",
    },
    {
      slug: "4u-server",
      model: "Server",
      u_height: 4,
      is_full_depth: true,
      category: "server",
    },

    // Network - generic
    {
      slug: "24-port-switch",
      model: "Switch (24-Port)",
      u_height: 1,
      is_full_depth: true,
      category: "network",
    },
    {
      slug: "48-port-switch",
      model: "Switch (48-Port)",
      u_height: 1,
      is_full_depth: true,
      category: "network",
    },
    {
      slug: "1u-router-firewall",
      model: "Router/Firewall",
      u_height: 1,
      is_full_depth: true,
      category: "network",
    },

    // Patch panels
    {
      slug: "24-port-patch-panel",
      model: "Patch Panel (24-Port)",
      u_height: 1,
      is_full_depth: false,
      category: "patch-panel",
    },
    {
      slug: "48-port-patch-panel",
      model: "Patch Panel (48-Port)",
      u_height: 2,
      is_full_depth: false,
      category: "patch-panel",
    },

    // Storage - generic
    {
      slug: "1u-storage",
      model: "Storage",
      u_height: 1,
      is_full_depth: true,
      category: "storage",
    },
    {
      slug: "2u-storage",
      model: "Storage",
      u_height: 2,
      is_full_depth: true,
      category: "storage",
    },
    {
      slug: "4u-storage",
      model: "Storage",
      u_height: 4,
      is_full_depth: true,
      category: "storage",
    },

    // Power - generic
    {
      slug: "1u-pdu",
      model: "PDU",
      u_height: 1,
      is_full_depth: false,
      category: "power",
    },
    {
      slug: "2u-ups",
      model: "UPS",
      u_height: 2,
      is_full_depth: true,
      category: "power",
    },
    {
      slug: "4u-ups",
      model: "UPS",
      u_height: 4,
      is_full_depth: true,
      category: "power",
    },

    // KVM
    {
      slug: "1u-kvm",
      model: "KVM",
      u_height: 1,
      is_full_depth: true,
      category: "kvm",
    },
    {
      slug: "1u-console-drawer",
      model: "Console Drawer",
      u_height: 1,
      is_full_depth: true,
      category: "kvm",
    },

    // AV/Media - generic
    {
      slug: "1u-receiver",
      model: "AV Receiver",
      u_height: 1,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "2u-amplifier",
      model: "Amplifier",
      u_height: 2,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "1u-video-switcher",
      model: "Video Switcher",
      u_height: 1,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "1u-audio-processor",
      model: "Audio Processor",
      u_height: 1,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "2u-media-player",
      model: "Media Player",
      u_height: 2,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "1u-streaming-encoder",
      model: "Streaming Encoder",
      u_height: 1,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "1u-dac",
      model: "DAC",
      u_height: 1,
      is_full_depth: false,
      category: "av-media",
    },
    {
      slug: "2u-av-receiver",
      model: "AV Receiver",
      u_height: 2,
      is_full_depth: true,
      category: "av-media",
    },
    {
      slug: "3u-power-amp",
      model: "Power Amplifier",
      u_height: 3,
      is_full_depth: true,
      category: "av-media",
    },

    // Cooling
    {
      slug: "1u-fan-panel",
      model: "Fan Panel",
      u_height: 1,
      is_full_depth: false,
      category: "cooling",
    },

    // Blanks
    {
      slug: "0-5u-blank",
      model: "Blank",
      u_height: 0.5,
      is_full_depth: false,
      category: "blank",
    },
    {
      slug: "1u-blank",
      model: "Blank",
      u_height: 1,
      is_full_depth: false,
      category: "blank",
    },
    {
      slug: "2u-blank",
      model: "Blank",
      u_height: 2,
      is_full_depth: false,
      category: "blank",
    },
    {
      slug: "3u-blank",
      model: "Blank",
      u_height: 3,
      is_full_depth: false,
      category: "blank",
    },
    {
      slug: "4u-blank",
      model: "Blank",
      u_height: 4,
      is_full_depth: false,
      category: "blank",
    },

    // Shelves
    {
      slug: "1u-shelf",
      model: "Shelf",
      u_height: 1,
      is_full_depth: true,
      category: "shelf",
    },
    {
      slug: "2u-shelf",
      model: "Shelf",
      u_height: 2,
      is_full_depth: true,
      category: "shelf",
    },
    {
      slug: "1u-vented-shelf",
      model: "Vented Shelf",
      u_height: 1,
      is_full_depth: true,
      category: "shelf",
    },

    // Cable management
    {
      slug: "1u-brush-panel",
      model: "Brush Panel",
      u_height: 1,
      is_full_depth: false,
      category: "cable-management",
    },
    {
      slug: "1u-cable-management",
      model: "Cable Management",
      u_height: 1,
      is_full_depth: false,
      category: "cable-management",
    },
    {
      slug: "2u-cable-management",
      model: "Cable Management",
      u_height: 2,
      is_full_depth: false,
      category: "cable-management",
    },
  ].map((d) => ({ ...d, manufacturer: undefined }) as ImportedDevice);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const statsOnly = args.includes("--stats");

  console.log(`\n🔌 Bulk NetBox Device Import`);
  console.log(`${"═".repeat(50)}`);
  if (dryRun) {
    console.log(`Mode: DRY RUN (no files will be written)`);
  }

  const allStats: ImportStats[] = [];
  const allDevices: ImportedDevice[] = [];

  for (const vendorConfig of VENDORS) {
    try {
      const { devices, stats } = await importVendorDevices(
        vendorConfig,
        dryRun || statsOnly,
      );
      allDevices.push(...devices);
      allStats.push(stats);
    } catch (error) {
      console.log(`  ❌ Error importing ${vendorConfig.name}: ${error}`);
      allStats.push({
        vendor: vendorConfig.name,
        total: 0,
        imported: 0,
        skipped: 0,
      });
    }
  }

  // Add generic devices
  const genericDevices = getGenericDevices();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${"═".repeat(50)}`);
  console.log(`\nGeneric devices: ${genericDevices.length}`);
  console.log(`\nBy vendor:`);
  for (const stats of allStats) {
    console.log(`  ${stats.vendor}: ${stats.imported}/${stats.total} imported`);
  }

  const totalBranded = allDevices.length;
  const totalAll = totalBranded + genericDevices.length;
  console.log(`\n📦 Total branded devices: ${totalBranded}`);
  console.log(`📦 Total all devices: ${totalAll}`);

  if (!dryRun && !statsOnly) {
    // Generate and write the library file
    const libraryContent = generateStarterLibrary(allDevices, genericDevices);
    await writeFile(STARTER_LIBRARY_PATH, libraryContent);
    console.log(`\n✅ Written to: ${STARTER_LIBRARY_PATH}`);

    console.log(`\n📋 Next steps:`);
    console.log(`1. Run: npm run lint -- --fix`);
    console.log(`2. Run: npm run test:run`);
    console.log(`3. Review the generated library`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
