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
 *
 * On a real (non-dry-run, non-images-only) import, the script writes new
 * device definitions to src/lib/data/brandPacks/<vendor>.ts (creating the
 * file if it does not exist yet) and, when any imported device has an image,
 * runs the image pipeline for that vendor only: scripts/process-images.ts
 * --vendor <vendor> followed by scripts/generate-bundled-images.ts, so
 * bundledImages.ts is regenerated in the same run. Devices whose slug is
 * already present in the brand pack file are skipped (idempotent re-runs).
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
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
  // Category keys with a hyphen (e.g. "patch-panel") are not valid dot-access
  // identifiers, so CATEGORY_COLOURS must be indexed with bracket notation for
  // those and dot notation otherwise, matching the convention used across the
  // brand pack files (see e.g. kws.ts's CATEGORY_COLOURS["patch-panel"]).
  const categoryColour = category.includes("-")
    ? `CATEGORY_COLOURS["${category}"]`
    : `CATEGORY_COLOURS.${category}`;

  const lines = [
    "\t{",
    `\t\tslug: '${device.slug}',`,
    `\t\tu_height: ${device.u_height},`,
    `\t\tmanufacturer: '${device.manufacturer}',`,
    `\t\tmodel: '${device.model}',`,
    `\t\tis_full_depth: ${device.is_full_depth ?? true},`,
    `\t\tcolour: ${categoryColour},`,
    `\t\tcategory: '${category}',`,
  ];

  if (device.front_image) {
    lines.push(`\t\tfront_image: true,`);
  }
  if (device.rear_image) {
    lines.push(`\t\trear_image: true,`);
  }
  if (device.airflow) {
    lines.push(`\t\tairflow: '${device.airflow}',`);
  }

  // Clean up trailing comma on the last property (whichever field ends up
  // last depends on which optional fields are present above).
  const lastLine = lines[lines.length - 1];
  if (lastLine.endsWith(",")) {
    lines[lines.length - 1] = lastLine.slice(0, -1);
  }

  lines.push("\t}");
  return lines.join("\n");
}

const BRAND_PACKS_DIR = join(ROOT_DIR, "src", "lib", "data", "brandPacks");

function brandPackFilePath(vendor: string): string {
  return join(BRAND_PACKS_DIR, `${vendor.toLowerCase()}.ts`);
}

/**
 * Extract every device slug already present in a brand pack file's source
 * text. Used to make writes idempotent: a slug found here is skipped rather
 * than appended again on a re-run.
 */
function extractExistingSlugs(content: string): Set<string> {
  const slugs = new Set<string>();
  const slugPattern = /slug:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = slugPattern.exec(content)) !== null) {
    const slug = match[1];
    if (slug) {
      slugs.add(slug);
    }
  }
  return slugs;
}

interface WriteBrandPackResult {
  filePath: string;
  added: NetBoxDevice[];
  skipped: NetBoxDevice[];
  created: boolean;
}

/**
 * Write newly imported devices into the vendor's brand pack file, creating
 * the file if it doesn't exist yet. Devices whose slug is already present are
 * skipped so re-running the import is a no-op for devices already added.
 */
async function writeBrandPackDevices(
  vendor: string,
  devices: NetBoxDevice[],
): Promise<WriteBrandPackResult> {
  const filePath = brandPackFilePath(vendor);
  const fileExists = existsSync(filePath);
  const existingContent = fileExists ? await readFile(filePath, "utf-8") : "";
  const existingSlugs = extractExistingSlugs(existingContent);

  const added = devices.filter((d) => !existingSlugs.has(d.slug));
  const skipped = devices.filter((d) => existingSlugs.has(d.slug));

  if (added.length === 0) {
    return { filePath, added, skipped, created: false };
  }

  const newEntries = added.map((d) => deviceToTypeScript(d)).join(",\n");

  if (fileExists) {
    const trimmed = existingContent.replace(/\s+$/, "");
    if (!trimmed.endsWith("];")) {
      throw new Error(
        `Could not safely append to ${filePath}: expected the file to end with "];"`,
      );
    }
    const before = trimmed.slice(0, -2).replace(/,\s*$/, "");
    const updated = `${before},\n${newEntries},\n];\n`;
    await writeFile(filePath, updated, "utf-8");
    return { filePath, added, skipped, created: false };
  }

  const vendorLower = vendor.toLowerCase();
  const arrayName = `${vendorLower}Devices`;
  const newFile = `/**
 * ${vendor} Brand Pack
 * Pre-defined device types for ${vendor} equipment
 * Source: NetBox community devicetype-library
 */

import type { DeviceType } from '$lib/types';
import { CATEGORY_COLOURS } from '$lib/types/constants';

export const ${arrayName}: DeviceType[] = [
${newEntries}
];
`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, newFile, "utf-8");
  return { filePath, added, skipped, created: true };
}

// npx ships as a .cmd shim on Windows, which spawnSync can't exec directly
// without a shell; select the shim there and the plain binary everywhere else.
const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";

/** Best-effort prettier formatting; a formatting failure should not abort the import. */
function formatWithPrettier(relativePath: string): boolean {
  const result = spawnSync(NPX_COMMAND, ["prettier", "--write", relativePath], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  return result.status === 0;
}

/** Runs scripts/process-images.ts scoped to one vendor, so unrelated vendors' images are untouched. */
function runProcessImagesForVendor(vendor: string): boolean {
  const result = spawnSync(
    NPX_COMMAND,
    ["tsx", "scripts/process-images.ts", "--vendor", vendor],
    { cwd: ROOT_DIR, stdio: "inherit" },
  );
  return result.status === 0;
}

/** Runs scripts/generate-bundled-images.ts to regenerate bundledImages.ts from the processed images on disk. */
function runGenerateBundledImages(): boolean {
  const result = spawnSync(
    NPX_COMMAND,
    ["tsx", "scripts/generate-bundled-images.ts"],
    { cwd: ROOT_DIR, stdio: "inherit" },
  );
  return result.status === 0;
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
    const vendorLower = options.vendor.toLowerCase();

    console.log(`\n📝 Writing device definitions...`);
    const { filePath, added, skipped, created } = await writeBrandPackDevices(
      options.vendor,
      importedDevices,
    );
    const relFilePath = relative(ROOT_DIR, filePath);

    if (added.length > 0) {
      console.log(
        `  ✅ ${created ? "Created" : "Updated"} ${relFilePath}: added ${added.length} device(s)`,
      );
      added.forEach((d) => console.log(`    + ${d.slug}`));
      formatWithPrettier(relFilePath);
    } else {
      console.log(`  ⏭️  ${relFilePath}: no new devices (all already present)`);
    }
    if (skipped.length > 0) {
      console.log(
        `  ⏭️  Skipped ${skipped.length} device(s) already in the brand pack:`,
      );
      skipped.forEach((d) => console.log(`    - ${d.slug}`));
    }
    if (created) {
      console.log(
        `\n⚠️  New brand pack file created. It still needs to be registered manually (see docs/guides/BRAND-PACKS.md):`,
      );
      console.log(
        `  1. Import ${vendorLower}Devices in src/lib/data/brandPacks/index.ts`,
      );
      console.log(`  2. Add one BRAND_PACK_REGISTRY entry`);
      console.log(`  3. Wire up the brand icon in BrandIcon.svelte`);
    }

    const devicesWithImages = added.filter(
      (d) => d.front_image || d.rear_image,
    );
    if (devicesWithImages.length > 0) {
      console.log(`\n📸 Processing images for ${options.vendor}...`);
      const processOk = runProcessImagesForVendor(vendorLower);
      if (!processOk) {
        console.log(
          `  ⚠️  Image processing failed; run 'npm run process-images' manually.`,
        );
      } else {
        console.log(`\n📸 Regenerating bundledImages.ts...`);
        const generateOk = runGenerateBundledImages();
        if (!generateOk) {
          console.log(
            `  ⚠️  bundledImages.ts regeneration failed; run 'npm run generate-bundled-images' manually.`,
          );
        } else {
          formatWithPrettier(join("src", "lib", "data", "bundledImages.ts"));
        }
      }
    }
  }

  if (!options.dryRun) {
    console.log(`\n📋 Next steps:`);
    console.log(
      `1. Review the diff (brand pack file, bundledImages.ts, images)`,
    );
    console.log(`2. Run: npm run build`);
    if (options.imagesOnly) {
      console.log(
        `3. Images only were downloaded; re-run without --images-only to write device definitions`,
      );
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
