#!/usr/bin/env npx tsx
/**
 * Bundled Images Generator Script
 *
 * Scans processed device images and generates bundledImages.ts
 *
 * Usage: npm run generate-bundled-images
 */

import { readdir, writeFile } from "fs/promises";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  parseImagePath,
  generateImportName,
  generateImportStatement,
  generateManifestEntry,
  groupImagesBySlug,
  type ParsedImage,
} from "../src/lib/utils/generate-bundled-images";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IMAGES_DIR = join(
  __dirname,
  "..",
  "src",
  "lib",
  "assets",
  "device-images",
);
const OUTPUT_FILE = join(
  __dirname,
  "..",
  "src",
  "lib",
  "data",
  "bundledImages.ts",
);

// Vendors to skip (already manually maintained in bundledImages.ts)
const STARTER_LIBRARY_DIRS = ["server", "network", "storage", "power", "kvm"];

async function getImageFiles(
  dir: string,
  basePath: string = "",
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip starter library directories
        if (!basePath && STARTER_LIBRARY_DIRS.includes(entry.name)) {
          continue;
        }
        const subFiles = await getImageFiles(fullPath, relativePath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith(".webp")) {
        files.push(relativePath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}

function generateFileContent(
  groupedImages: ReturnType<typeof groupImagesBySlug>,
): string {
  const imports: string[] = [];
  const manifestEntries: string[] = [];

  // Sort slugs by vendor then by slug name
  const sortedSlugs = Object.keys(groupedImages).sort((a, b) => {
    const vendorA = groupedImages[a].vendor;
    const vendorB = groupedImages[b].vendor;
    if (vendorA !== vendorB) return vendorA.localeCompare(vendorB);
    return a.localeCompare(b);
  });

  let currentVendor = "";

  for (const slug of sortedSlugs) {
    const { vendor, front, rear } = groupedImages[slug];

    // Add vendor section comment
    if (vendor !== currentVendor) {
      if (currentVendor !== "") {
        imports.push("");
        manifestEntries.push("");
      }
      imports.push(`// ${vendor.toUpperCase()} images`);
      manifestEntries.push(`\t// ${vendor.toUpperCase()}`);
      currentVendor = vendor;
    }

    const importNames: { front?: string; rear?: string } = {};

    if (front) {
      const importName = generateImportName(slug, "front");
      imports.push(generateImportStatement(vendor, slug, "front"));
      importNames.front = importName;
    }

    if (rear) {
      const importName = generateImportName(slug, "rear");
      imports.push(generateImportStatement(vendor, slug, "rear"));
      importNames.rear = importName;
    }

    manifestEntries.push(`\t${generateManifestEntry(slug, importNames)},`);
  }

  // Remove trailing comma from last entry
  if (manifestEntries.length > 0) {
    const lastIndex = manifestEntries.length - 1;
    manifestEntries[lastIndex] = manifestEntries[lastIndex].replace(/,$/, "");
  }

  return `/**
 * Bundled Device Images Manifest
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 *
 * Maps device slugs to bundled WebP images using Vite's static asset imports.
 * These images are pre-bundled with the app for immediate display.
 *
 * Images sourced from NetBox Device Type Library (CC0 licensed)
 * https://github.com/netbox-community/devicetype-library
 */

// ============================================
// Starter Library (Generic Devices) - Manual
// ============================================

// Server images
import server1uFront from '$lib/assets/device-images/server/1u-server.front.webp';
import server2uFront from '$lib/assets/device-images/server/2u-server.front.webp';
import server4uFront from '$lib/assets/device-images/server/4u-server.front.webp';

// Network images
import switch24portFront from '$lib/assets/device-images/network/24-port-switch.front.webp';
import switch48portFront from '$lib/assets/device-images/network/48-port-switch.front.webp';
import routerFirewallFront from '$lib/assets/device-images/network/1u-router-firewall.front.webp';

// Storage images
import storage1uFront from '$lib/assets/device-images/storage/1u-storage.front.webp';
import storage2uFront from '$lib/assets/device-images/storage/2u-storage.front.webp';
import storage4uFront from '$lib/assets/device-images/storage/4u-storage.front.webp';

// Power images
import ups2uFront from '$lib/assets/device-images/power/2u-ups.front.webp';

// KVM images
import consoleDrawerFront from '$lib/assets/device-images/kvm/1u-console-drawer.front.webp';

// ============================================
// Brand Pack Images - Auto-generated
// ============================================

${imports.join("\n")}

/**
 * Bundled image data structure
 */
interface BundledImageSet {
	front?: string;
	rear?: string;
}

/**
 * Map of device slugs to their bundled images
 *
 * Keys match the slugs in device type definitions
 * Only devices with real images are included
 */
const BUNDLED_IMAGES: Record<string, BundledImageSet> = {
	// ============================================
	// Starter Library (Generic Devices)
	// ============================================

	// Servers
	'1u-server': { front: server1uFront },
	'2u-server': { front: server2uFront },
	'4u-server': { front: server4uFront },

	// Network
	'24-port-switch': { front: switch24portFront },
	'48-port-switch': { front: switch48portFront },
	'1u-router-firewall': { front: routerFirewallFront },

	// Storage
	'1u-storage': { front: storage1uFront },
	'2u-storage': { front: storage2uFront },
	'4u-storage': { front: storage4uFront },

	// Power
	'2u-ups': { front: ups2uFront },

	// KVM
	'1u-console-drawer': { front: consoleDrawerFront },

	// ============================================
	// Brand Pack Images - Auto-generated
	// ============================================

${manifestEntries.join("\n")}
};

/**
 * Get a bundled image URL for a device slug and face
 *
 * @param slug - Device type slug (e.g., '1u-server')
 * @param face - 'front' or 'rear'
 * @returns Image URL string or undefined if no bundled image exists
 *
 * @example
 * getBundledImage('1u-server', 'front') // '/assets/server/1u-server.front.webp'
 * getBundledImage('ubiquiti-unifi-dream-machine-pro', 'front') // Returns UDM-Pro front image
 */
export function getBundledImage(slug: string, face: 'front' | 'rear'): string | undefined {
	const imageSet = BUNDLED_IMAGES[slug];
	if (!imageSet) return undefined;
	return imageSet[face];
}

/**
 * Get list of device slugs that have bundled images
 *
 * @returns Array of device slug strings
 *
 * @example
 * getBundledImageSlugs() // ['1u-server', '2u-server', ..., 'ubiquiti-unifi-dream-machine-pro', ...]
 */
export function getBundledImageSlugs(): string[] {
	return Object.keys(BUNDLED_IMAGES);
}

/**
 * Check if a device slug has a bundled image
 *
 * @param slug - Device type slug
 * @returns true if device has at least one bundled image
 */
export function hasBundledImage(slug: string): boolean {
	return slug in BUNDLED_IMAGES;
}
`;
}

async function main(): Promise<void> {
  console.log("🖼️  Bundled Images Generator");
  console.log("============================\n");

  // Get all image files
  const imageFiles = await getImageFiles(IMAGES_DIR);
  console.log(`Found ${imageFiles.length} device images\n`);

  // Parse images
  const parsedImages: ParsedImage[] = [];
  for (const file of imageFiles) {
    const parsed = parseImagePath(file);
    if (parsed) {
      parsedImages.push(parsed);
    }
  }

  console.log(`Parsed ${parsedImages.length} valid images\n`);

  // Group by slug
  const grouped = groupImagesBySlug(parsedImages);
  const slugCount = Object.keys(grouped).length;
  console.log(`Grouped into ${slugCount} device entries\n`);

  // Count by vendor
  const vendorCounts: Record<string, number> = {};
  for (const slug of Object.keys(grouped)) {
    const vendor = grouped[slug].vendor;
    vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
  }

  console.log("By vendor:");
  for (const [vendor, count] of Object.entries(vendorCounts).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    console.log(`  ${vendor}: ${count} devices`);
  }
  console.log();

  // Generate file content
  const content = generateFileContent(grouped);

  // Write file
  await writeFile(OUTPUT_FILE, content, "utf-8");
  console.log(`✅ Generated: ${relative(process.cwd(), OUTPUT_FILE)}\n`);
}

main().catch(console.error);
