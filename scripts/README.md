# Scripts

Utility scripts for build, maintenance, data import, and performance tasks.

## Build & Deployment

| Script                        | Purpose                                                       | Usage                                        |
| ----------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `generate-bundled-images.ts`  | Generates `bundledImages.ts` from processed device images     | `npx tsx scripts/generate-bundled-images.ts` |
| `generate-gh-dash-config.js`  | Generates `.gh-dash.yml` with dynamic milestone detection     | `node scripts/generate-gh-dash-config.js`    |
| `verify-version-alignment.sh` | Verifies all published images report the same release version | `bash scripts/verify-version-alignment.sh`   |

## Maintenance

| Script                            | Purpose                                                                                     | Usage                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `check-compose-persist-parity.sh` | Checks docker-compose.yml parity between root and deploy/                                   | `bash scripts/check-compose-persist-parity.sh` |
| `backfill-labels.sh`              | One-time label cleanup: renames misspelled labels, merges duplicates, removes obsolete ones | `bash scripts/backfill-labels.sh`              |
| `update-contributors.ts`          | Updates contributors section in ACKNOWLEDGEMENTS.md                                         | `npx tsx scripts/update-contributors.ts`       |

## Data Import (NetBox)

Three scripts for importing device definitions from the [NetBox devicetype-library](https://github.com/netbox-community/devicetype-library):

| Script                                  | Purpose                                                   | Scope                            |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| `import-netbox-devices.ts`              | Full import from NetBox devicetype-library                | All vendors and devices          |
| `curated-import.ts`                     | Curated import of popular models                          | ~420 devices from select vendors |
| `bulk-import-netbox.ts`                 | Bulk import across multiple vendors                       | Multiple vendors, configurable   |
| `generate-netbox-homelab-candidates.ts` | Ranked net-new homelab candidates from local NetBox clone | Homelab-focused ranking          |

## Image Processing

| Script              | Purpose                                                                                                       | Usage                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `process-images.ts` | Processes device images from `assets-source/` to `src/lib/assets/device-images/` (resizes to 400px max width) | `npx tsx scripts/process-images.ts` |
| `audit-images.ts`   | Compares source vs processed images to detect clipping                                                        | `npx tsx scripts/audit-images.ts`   |

## Performance

| Script                       | Purpose                                                                           | Usage                                        |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| `performance-benchmark.ts`   | Measures render performance at various device and port counts                     | `npx tsx scripts/performance-benchmark.ts`   |
| `measure-startup-payload.ts` | Measures startup payload from `dist/index.html` modulepreload + entry script refs | `npx tsx scripts/measure-startup-payload.ts` |
