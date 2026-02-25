#!/usr/bin/env npx tsx
/**
 * NetBox Device Import Script
 *
 * Imports device definitions and images from the NetBox devicetype-library.
 * Can be run locally or as a GitHub Action.
 *
 * Usage:
 *   npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --slug ubiquiti-usw-pro-24
 *   npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --all
 *   npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --list
 *   npx tsx scripts/import-netbox-devices.ts --list-vendors
 *
 * Options:
 *   --vendor <name>   Vendor name (case-sensitive, matches NetBox folder name)
 *   --slug <slug>     Import a specific device by slug
 *   --all             Import all devices from the vendor
 *   --list            List available devices without importing
 *   --list-vendors    List all available vendors
 *   --dry-run         Show what would be imported without making changes
 *   --images-only     Only download images, don't update TypeScript files
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

// Local paths
const ASSETS_SOURCE_DIR = join(ROOT_DIR, "assets-source", "device-images");

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
}

interface ImportOptions {
  vendor: string;
  slug?: string;
  all?: boolean;
  list?: boolean;
  listVendors?: boolean;
  dryRun?: boolean;
  imagesOnly?: boolean;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = { vendor: "" };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--vendor":
        options.vendor = args[++i];
        break;
      case "--slug":
        options.slug = args[++i];
        break;
      case "--all":
        options.all = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--list-vendors":
        options.listVendors = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--images-only":
        options.imagesOnly = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
NetBox Device Import Script

Usage:
  npx tsx scripts/import-netbox-devices.ts --vendor <name> [options]

Options:
  --vendor <name>   Vendor name (required, case-sensitive)
  --slug <slug>     Import a specific device by slug
  --all             Import all rack-mountable devices from vendor
  --list            List available devices without importing
  --list-vendors    List all available vendors
  --dry-run         Show what would be imported without changes
  --images-only     Only download images, skip TypeScript updates
  --help            Show this help message

Examples:
  # List all Ubiquiti devices
  npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --list

  # Import a specific device
  npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --slug ubiquiti-usw-pro-24

  # Import all Dell PowerEdge servers
  npx tsx scripts/import-netbox-devices.ts --vendor Dell --all

  # List all available vendors
  npx tsx scripts/import-netbox-devices.ts --list-vendors
`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Rackula-Import-Script",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Rackula-Import-Script",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Rackula-Import-Script",
      },
    });

    if (!response.ok) {
      return false;
    }

    const buffer = await response.arrayBuffer();
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, Buffer.from(buffer));
    return true;
  } catch {
    return false;
  }
}

async function listVendors(): Promise<string[]> {
  const url = `${NETBOX_API_BASE}/device-types`;
  const entries = await fetchJson<Array<{ name: string; type: string }>>(url);
  return entries.filter((e) => e.type === "dir").map((e) => e.name);
}

async function listVendorDevices(vendor: string): Promise<string[]> {
  const url = `${NETBOX_API_BASE}/device-types/${vendor}`;
  const files = await fetchJson<Array<{ name: string }>>(url);
  return files
    .filter((f) => f.name.endsWith(".yaml"))
    .map((f) => f.name.replace(".yaml", ""));
}

async function fetchDeviceYaml(
  vendor: string,
  slug: string,
): Promise<NetBoxDevice | null> {
  const url = `${NETBOX_RAW_BASE}/device-types/${vendor}/${slug}.yaml`;

  try {
    const yamlText = await fetchText(url);
    return yaml.load(yamlText) as NetBoxDevice;
  } catch {
    return null;
  }
}

function slugToVarName(slug: string): string {
  // Convert slug to camelCase variable name
  // ubiquiti-usw-pro-24 -> ubiquitiUswPro24
  return slug
    .split("-")
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

function inferCategory(device: NetBoxDevice): string {
  const model = device.model.toLowerCase();
  const slug = device.slug.toLowerCase();

  // Check common patterns
  if (model.includes("switch") || slug.includes("switch")) return "network";
  if (model.includes("router") || slug.includes("router")) return "network";
  if (model.includes("gateway") || slug.includes("gateway")) return "network";
  if (model.includes("firewall")) return "network";
  if (model.includes("ups") || slug.includes("ups")) return "power";
  if (model.includes("pdu") || slug.includes("pdu")) return "power";
  if (model.includes("nas") || model.includes("rs") || model.includes("ds"))
    return "storage";
  if (model.includes("poweredge") || model.includes("proliant"))
    return "server";
  if (model.includes("nvr") || slug.includes("nvr")) return "server";
  if (model.includes("patch")) return "patch-panel";

  // Default to server for unknown rack devices
  return "server";
}

function deviceToTypeScript(device: NetBoxDevice): string {
  const category = inferCategory(device);
  const categoryColour = `CATEGORY_COLOURS.${category.replace("-", "_")}`;

  const lines = [
    "\t{",
    `\t\tslug: '${device.slug}',`,
    `\t\tu_height: ${device.u_height},`,
    `\t\tmanufacturer: '${device.manufacturer}',`,
    `\t\tmodel: '${device.model}',`,
    `\t\tis_full_depth: ${device.is_full_depth ?? true},`,
    `\t\tcolour: ${categoryColour},`,
    `\t\tcategory: '${category}'`,
  ];

  if (device.front_image) {
    lines.push(`\t\tfront_image: true,`);
  }
  if (device.rear_image) {
    lines.push(`\t\trear_image: true`);
  }
  if (device.airflow) {
    lines.push(`\t\tairflow: '${device.airflow}',`);
  }

  // Clean up trailing comma on last property
  const lastLine = lines[lines.length - 1];
  if (lastLine.endsWith(",")) {
    lines[lines.length - 1] = lastLine.slice(0, -1);
  }

  lines.push("\t}");
  return lines.join("\n");
}

async function importDevice(
  vendor: string,
  slug: string,
  options: ImportOptions,
): Promise<{
  device: NetBoxDevice | null;
  frontImage: boolean;
  rearImage: boolean;
}> {
  console.log(`\nImporting: ${slug}`);

  // Fetch device YAML
  const device = await fetchDeviceYaml(vendor, slug);
  if (!device) {
    console.log(`  ⚠️  Could not fetch device YAML`);
    return { device: null, frontImage: false, rearImage: false };
  }

  console.log(`  Model: ${device.model}`);
  console.log(`  Height: ${device.u_height}U`);

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would import this device`);
    return { device, frontImage: false, rearImage: false };
  }

  // Download images
  const vendorLower = vendor.toLowerCase();
  const destDir = join(ASSETS_SOURCE_DIR, vendorLower);

  // Use the device.slug from YAML (already lowercase with vendor prefix)
  // e.g., device.slug = 'hpe-proliant-dl360-gen10'
  const imageSlug = device.slug;

  let frontImage: boolean;
  let rearImage: boolean;

  // Try to download front image (try .png first, then .jpg)
  const frontDest = join(destDir, `${imageSlug}.front.png`);
  const frontDestJpg = join(destDir, `${imageSlug}.front.jpg`);
  if (!existsSync(frontDest) && !existsSync(frontDestJpg)) {
    // Try PNG first
    let frontUrl = `${NETBOX_RAW_BASE}/elevation-images/${vendor}/${imageSlug}.front.png`;
    frontImage = await downloadImage(frontUrl, frontDest);
    if (!frontImage) {
      // Try JPG
      frontUrl = `${NETBOX_RAW_BASE}/elevation-images/${vendor}/${imageSlug}.front.jpg`;
      frontImage = await downloadImage(frontUrl, frontDestJpg);
    }
    if (frontImage) {
      console.log(`  ✅ Downloaded front image`);
    }
  } else {
    frontImage = true;
    console.log(`  ⏭️  Front image already exists`);
  }

  // Try to download rear image (try .png first, then .jpg)
  const rearDest = join(destDir, `${imageSlug}.rear.png`);
  const rearDestJpg = join(destDir, `${imageSlug}.rear.jpg`);
  if (!existsSync(rearDest) && !existsSync(rearDestJpg)) {
    // Try PNG first
    let rearUrl = `${NETBOX_RAW_BASE}/elevation-images/${vendor}/${imageSlug}.rear.png`;
    rearImage = await downloadImage(rearUrl, rearDest);
    if (!rearImage) {
      // Try JPG
      rearUrl = `${NETBOX_RAW_BASE}/elevation-images/${vendor}/${imageSlug}.rear.jpg`;
      rearImage = await downloadImage(rearUrl, rearDestJpg);
    }
    if (rearImage) {
      console.log(`  ✅ Downloaded rear image`);
    }
  } else {
    rearImage = true;
    console.log(`  ⏭️  Rear image already exists`);
  }

  // Update device with image flags based on what we downloaded
  device.front_image = frontImage;
  device.rear_image = rearImage;

  return { device, frontImage, rearImage };
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Handle --list-vendors before requiring --vendor
  if (options.listVendors) {
    console.log(`\n🔌 NetBox Device Import`);
    console.log(`========================`);
    console.log(`\nFetching vendor list...`);
    const vendors = await listVendors();
    console.log(`\nFound ${vendors.length} vendor(s):\n`);
    vendors.forEach((v) => console.log(`  ${v}`));
    return;
  }

  if (!options.vendor) {
    console.error("Error: --vendor is required");
    printHelp();
    process.exit(1);
  }

  console.log(`\n🔌 NetBox Device Import`);
  console.log(`========================`);
  console.log(`Vendor: ${options.vendor}`);

  if (options.list) {
    console.log(`\nFetching device list...`);
    const devices = await listVendorDevices(options.vendor);
    console.log(`\nFound ${devices.length} device(s):\n`);
    devices.forEach((d) => console.log(`  - ${d}`));
    return;
  }

  let slugsToImport: string[] = [];

  if (options.slug) {
    slugsToImport = [options.slug];
  } else if (options.all) {
    console.log(`\nFetching all devices...`);
    slugsToImport = await listVendorDevices(options.vendor);
    console.log(`Found ${slugsToImport.length} device(s)`);
  } else {
    console.error("Error: Specify --slug <slug> or --all");
    process.exit(1);
  }

  const importedDevices: NetBoxDevice[] = [];

  for (const slug of slugsToImport) {
    const result = await importDevice(options.vendor, slug, options);
    if (result.device && result.device.u_height >= 1) {
      // Only import rack-mountable devices (1U or higher)
      importedDevices.push(result.device);
    }
  }

  console.log(`\n========================`);
  console.log(`Imported ${importedDevices.length} rack-mountable device(s)`);

  if (importedDevices.length > 0 && !options.dryRun && !options.imagesOnly) {
    // Generate TypeScript for imported devices
    console.log(`\n📝 Generated TypeScript:`);
    console.log(`\nAdd these to your brand pack file:\n`);
    console.log(`import type { DeviceType } from '$lib/types';`);
    console.log(`import { CATEGORY_COLOURS } from '$lib/types/constants';\n`);
    console.log(
      `export const ${options.vendor.toLowerCase()}Devices: DeviceType[] = [`,
    );
    importedDevices.forEach((device, i) => {
      console.log(
        deviceToTypeScript(device) +
          (i < importedDevices.length - 1 ? "," : ""),
      );
    });
    console.log(`];`);

    // Generate bundledImages.ts entries
    const devicesWithImages = importedDevices.filter(
      (d) => d.front_image || d.rear_image,
    );
    if (devicesWithImages.length > 0) {
      console.log(`\n📸 Add to bundledImages.ts:\n`);
      console.log(`// Imports:`);
      const vendorLower = options.vendor.toLowerCase();
      devicesWithImages.forEach((device) => {
        const varBase = slugToVarName(device.slug);
        if (device.front_image) {
          console.log(
            `import ${varBase}Front from '$lib/assets/device-images/${vendorLower}/${device.slug}.front.webp';`,
          );
        }
        if (device.rear_image) {
          console.log(
            `import ${varBase}Rear from '$lib/assets/device-images/${vendorLower}/${device.slug}.rear.webp';`,
          );
        }
      });

      console.log(`\n// Manifest entries:`);
      devicesWithImages.forEach((device) => {
        const varBase = slugToVarName(device.slug);
        const parts = [];
        if (device.front_image) parts.push(`front: ${varBase}Front`);
        if (device.rear_image) parts.push(`rear: ${varBase}Rear`);
        console.log(`'${device.slug}': { ${parts.join(", ")} },`);
      });
    }
  }

  if (!options.dryRun) {
    console.log(`\n📋 Next steps:`);
    console.log(`1. Run: npm run process-images`);
    console.log(`2. Update src/lib/data/bundledImages.ts with new imports`);
    console.log(`3. Add devices to brand pack file if not already present`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
