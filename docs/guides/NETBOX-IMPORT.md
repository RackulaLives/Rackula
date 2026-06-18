# NetBox Device Import Guide

This guide explains how to import devices from the [NetBox community devicetype-library](https://github.com/netbox-community/devicetype-library) into Rackula.

## Quick Start

### Complete Import Workflow

```bash
# 1. Import devices (downloads YAML + images automatically)
npx tsx scripts/import-netbox-devices.ts --vendor HPE --all

# 2. Process images (convert to optimized WebP)
npm run process-images

# 3. Generate bundled images manifest (register images for bundling)
npm run generate-bundled-images

# 4. Verify build works
npm run build
```

### Using the Import Script

```bash
# List available devices from a vendor
npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --list

# Import a specific device
npx tsx scripts/import-netbox-devices.ts --vendor Ubiquiti --slug ubiquiti-usw-pro-24

# Import all devices from a vendor (dry run first!)
npx tsx scripts/import-netbox-devices.ts --vendor Dell --all --dry-run
npx tsx scripts/import-netbox-devices.ts --vendor Dell --all
```

### Using GitHub Actions

1. Go to **Actions** → **Import NetBox Devices**
2. Click **Run workflow**
3. Enter the vendor name and optionally a specific slug
4. Enable **Dry run** to preview changes first
5. The action creates a PR with the imported devices

## Manual Import Process

### Step 1: Find Device in NetBox Library

Browse the [NetBox devicetype-library](https://github.com/netbox-community/devicetype-library/tree/master/device-types) to find devices.

**Directory structure:**

```
device-types/
├── Ubiquiti/
│   ├── USW-Pro-24.yaml
│   └── ...
├── Dell/
│   ├── PowerEdge-R640.yaml
│   └── ...
└── ...
```

### Step 2: Download Device YAML

Example Ubiquiti switch YAML:

```yaml
manufacturer: Ubiquiti
model: USW-Pro-24
slug: ubiquiti-usw-pro-24
u_height: 1
is_full_depth: false
front_image: true
rear_image: true
```

### Step 3: Convert to TypeScript

Map NetBox fields to Rackula `DeviceType`:

| NetBox Field    | Rackula Field   | Notes                              |
| --------------- | --------------- | ---------------------------------- |
| `slug`          | `slug`          | Direct mapping                     |
| `manufacturer`  | `manufacturer`  | Direct                             |
| `model`         | `model`         | Direct                             |
| `u_height`      | `u_height`      | Direct                             |
| `is_full_depth` | `is_full_depth` | Default: `true`                    |
| `front_image`   | `front_image`   | Boolean flag                       |
| `rear_image`    | `rear_image`    | Boolean flag                       |
| `airflow`       | `airflow`       | Optional                           |
| —               | `colour`        | Use `CATEGORY_COLOURS.{category}`  |
| —               | `category`      | Infer from device type (see below) |

**TypeScript result:**

```typescript
{
  slug: 'ubiquiti-usw-pro-24',
  u_height: 1,
  manufacturer: 'Ubiquiti',
  model: 'USW-Pro-24',
  is_full_depth: false,
  colour: CATEGORY_COLOURS.network,
  category: 'network',
  front_image: true,
  rear_image: true
}
```

### Step 4: Download Elevation Images

Images are in the `elevation-images/` directory:

```
elevation-images/
├── Ubiquiti/
│   ├── ubiquiti-usw-pro-24.front.png
│   ├── ubiquiti-usw-pro-24.rear.png
│   └── ...
└── ...
```

**URL pattern:**

```
https://raw.githubusercontent.com/netbox-community/devicetype-library/master/elevation-images/{Vendor}/{slug}.{face}.png
```

**Download to:**

```
assets-source/device-images/{vendor}/{slug}.{face}.png
```

### Step 5: Process Images

Run the image processor to convert to optimized WebP:

```bash
npm run process-images
```

This:

- Reads from `assets-source/device-images/`
- Resizes to max 400px width (preserves aspect ratio)
- Converts to WebP format
- Outputs to `src/lib/assets/device-images/`

### Step 6: Generate bundledImages.ts

Run the bundled images generator to register new images:

```bash
npm run generate-bundled-images
```

This:

- Scans `src/lib/assets/device-images/` for vendor subdirectories
- Parses image paths to extract slug and face (front/rear)
- Groups images by device slug
- Auto-generates ES module imports and manifest entries
- Preserves the starter library (manually maintained generic devices)

**Output example:**

```
🖼️  Bundled Images Generator
============================

Found 366 device images
Parsed 366 valid images
Grouped into 206 device entries

By vendor:
  apc: 29 devices
  dell: 21 devices
  hpe: 12 devices
  ubiquiti: 48 devices
  ...

✅ Generated: src/lib/data/bundledImages.ts
```

> **Note:** The generator automatically creates proper import statements and manifest entries. You no longer need to manually edit `bundledImages.ts` for brand pack images.

### Step 7: Add to Brand Pack

Add device to the appropriate brand pack file in `src/lib/data/brandPacks/`:

```typescript
// src/lib/data/brandPacks/ubiquiti.ts
export const ubiquitiDevices: DeviceType[] = [
  // ... existing devices
  {
    slug: "ubiquiti-usw-pro-24",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-24",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true,
  },
];
```

## Category Mapping

Infer category from device type:

| Device Type                       | Rackula Category |
| --------------------------------- | ---------------- |
| Switch, Router, Gateway, Firewall | `network`        |
| PowerEdge, ProLiant, Server       | `server`         |
| NAS, RS*, DS*                     | `storage`        |
| UPS                               | `power`          |
| PDU                               | `power`          |
| NVR                               | `server`         |
| Patch Panel                       | `patch-panel`    |
| KVM, Console                      | `kvm`            |
| Unknown                           | `other`          |

## Quality Checklist

Before committing imported devices:

- [ ] Slug matches NetBox convention (`{manufacturer}-{product-line}-{model}`)
- [ ] `u_height` is correct (check NetBox YAML)
- [ ] `is_full_depth` is set correctly
- [ ] Category is appropriate for device type
- [ ] Front/rear images downloaded (if available)
- [ ] Images processed to WebP (`npm run process-images`)
- [ ] `bundledImages.ts` regenerated (`npm run generate-bundled-images`)
- [ ] Brand pack file updated
- [ ] Build succeeds (`npm run build`)
- [ ] Tests pass (`npm run test:run`)

## Slug Naming Convention

Rackula uses NetBox-compatible slugs:

**Pattern:** `{manufacturer}-{product-line}-{model}`

**Examples:**

- `ubiquiti-usw-pro-24` (UniFi Switch Pro 24)
- `dell-poweredge-r640` (Dell PowerEdge R640)
- `synology-rs1221-plus` (Synology RS1221+)

**Rules:**

- Lowercase
- Kebab-case (hyphens, no underscores)
- No special characters (+ becomes `-plus`)
- Must be unique across all devices

## Troubleshooting

### Image not found

Not all NetBox devices have elevation images. Check the `elevation-images/` directory for your vendor.

### Wrong aspect ratio

The `process-images.ts` script uses `fit: 'inside'` which preserves aspect ratio. If images appear stretched, check the source image.

### Slug mismatch

NetBox YAML filenames don't always match the slug inside. Use the `slug` field from the YAML, not the filename.

## License

NetBox devicetype-library is licensed under **CC0 1.0 Universal** (Public Domain):

- No attribution required
- Can modify and redistribute freely
- Commercial use allowed
