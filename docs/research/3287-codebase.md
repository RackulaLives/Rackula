# Spike #3287: codebase findings

Line references are to main at 466c49a1 (2026-09-13). PR #3280 (merged 2026-09-14 UTC, #3108) later wired the layout writers to `SCHEMA_VERSION`. The section 3 finding that writers default to "1.0" is therefore true at 466c49a1 only.

Codebase-exploration phase for representing NVIDIA DGX BasePOD and SuperPOD. Branch `spike/3287-research` at `466c49a1`. All line numbers were read on this branch. Issue states come from read-only `gh issue view` on 2026-09-13.

## Files examined

- `src/lib/schemas/index.ts`: Zod layout schema (DeviceType, InterfaceType, PlacedPort, Connection, Rack, RackGroup, Layout).
- `src/lib/schemas/migrations.ts`: `SCHEMA_VERSION`, forward-compat version gate, legacy position migration.
- `src/lib/schemas/share.ts`: minimal share-link format.
- `src/lib/zod.ts`: project Zod instance (jitless only).
- `src/lib/types/index.ts`: hand-written TypeScript types (second declaration of InterfaceType and DeviceCategory).
- `src/lib/types/constants.ts`: category colours, rack limits, depth defaults.
- `src/lib/constants/layout.ts`: canvas pixel constants.
- `src/lib/data/brandPacks/index.ts`: `BRAND_PACK_REGISTRY` and pack lookups.
- `src/lib/data/brandPacks/dell.ts`: largest-U precedent (M1000e, MX7000).
- `src/lib/data/starterLibrary.ts`: generic (unbranded) device library.
- `src/lib/data/bundledImages.ts`: generated image manifest.
- `src/lib/templates/starter-templates.ts`: starter manifest, colours, loader, summary text.
- `src/lib/stores/starter-templates.svelte.ts`: lazy shared starter source and open path.
- `src/lib/components/NewLayoutMenu.svelte`: desktop split "+" menu.
- `src/lib/components/mobile/MobileLayoutsSheet.svelte`: mobile "New from template" row.
- `src/lib/actions/registry.ts`, `src/lib/actions/dispatch.ts`: command-palette starter entries.
- `src/lib/components/layout-preview-render.ts`: Layouts sidebar thumbnail renderer.
- `src/lib/utils/yaml.ts`: YAML parse and validation ingress (file and localStorage doors).
- `src/lib/utils/import-errors.ts`: validation error wording.
- `src/lib/stores/layout/layout-lifecycle.ts`: store `loadLayout` (id dedup, port and connection remap).
- `src/lib/stores/layout/device-actions.ts`, `src/lib/stores/layout/recorded-device-actions.ts`: placement, port instantiation, device-type auto-import.
- `src/lib/stores/layout-helpers.ts`, `src/lib/stores/layout/mutators.ts`: device-type add helpers.
- `src/lib/stores/workspace.svelte.ts`: `openTab` into the store.
- `src/lib/utils/device-lookup.ts`: slug resolution order and custom detection.
- `src/lib/utils/device.ts`: `generateId`.
- `src/lib/utils/port-utils.ts`: port category, direction inference, `instantiatePorts`.
- `src/lib/utils/port-geometry.ts`: port anchors and `HIGH_DENSITY_THRESHOLD`.
- `src/lib/utils/connection-path.ts`: anchor map and connection render/skip rules.
- `src/lib/utils/connection-creation.ts`: click-to-connect handler.
- `src/lib/stores/connection.svelte.ts`: connection CRUD and validation.
- `src/lib/components/ConnectionLayer.svelte`: per-rack, per-face connection layer.
- `src/lib/components/PortIndicators.svelte`: port circles and grouped badges.
- `src/lib/components/PortTooltip.svelte`: port type labels.
- `src/lib/components/Rack.svelte`: per-face rack SVG with device and connection layers.
- `src/lib/components/RackDevice.svelte`: device body, image fallback, ports, container children.
- `src/lib/components/RackDualView.svelte`, `src/lib/components/BayedRackView.svelte`: front and rear `Rack` instances.
- `src/lib/components/RackCanvasView.svelte`: canvas row of racks and groups.
- `src/lib/utils/rack-row.ts`: row ordering of racks and groups.
- `src/lib/utils/canvas.ts`: rack geometry and fit-all.
- `src/lib/stores/canvas.svelte.ts`, `src/lib/utils/panzoom-lifecycle.ts`, `src/lib/components/Canvas.svelte`: zoom limits and panzoom wiring.
- `src/lib/stores/layout.svelte.ts`, `src/lib/stores/layout/rack-actions.ts`, `src/lib/stores/layout/rack-groups.ts`: `MAX_RACKS` enforcement and group rules.
- `src/lib/components/EditPanelRack.svelte`, `src/lib/components/RackEditSheet.svelte`: rack height, width and depth controls.
- `src/lib/components/DevicePalette.svelte`: device library sections, search, filters, virtualisation.
- `src/lib/utils/deviceFilters.ts`, `src/lib/utils/deviceGrouping.ts`, `src/lib/components/DeviceFilterPopover.svelte`: Fuse config, category order, grouping modes, attribute filters.
- `src/lib/components/BrandIcon.svelte`: brand icon map and fallback.
- `src/lib/components/CommandPalette.svelte`: palette device sources.
- `src/lib/components/CategoryIcon.svelte`, `src/lib/components/CategoryIconSVG.svelte`: per-category icon maps.
- `src/lib/utils/netbox-import.ts`: in-app NetBox YAML import (ImportFromNetBoxDialog).
- `scripts/import-netbox-devices.ts`: NetBox import script behind NETBOX-IMPORT.md.
- `scripts/bulk-import-netbox.ts`, `scripts/curated-import.ts`, `scripts/generate-netbox-homelab-candidates.ts`: auxiliary NetBox scripts (headers only).
- `scripts/process-images.ts`, `scripts/generate-bundled-images.ts`: image pipeline.
- `src/lib/stores/images.svelte.ts`: image store and slug lookup.
- `scripts/generate-schema.ts`, `src/tests/layout-json-schema.test.ts`, `static/schemas/rackula-layout.schema.json`: published JSON Schema and drift guard.
- `scripts/check-corpus-freshness.sh`, `scripts/add-corpus-fixture.sh`: upgrade-corpus release gate and fixture helper.
- `src/tests/upgrade-corpus.test.ts`, `src/tests/fixtures/upgrade-corpus/README.md`, `src/tests/fixtures/upgrade-corpus/schema-version-future.rackula.yaml`: corpus harness and reject fixture.
- `src/lib/utils/share.ts`: share-link encode/decode and size limits.
- `src/lib/storage/browser-workspace.ts`: localStorage workspace index and layout bodies.
- `src/lib/storage/adapt-legacy-layout.ts`: legacy adapter (dangling connection drop).
- `src/lib/storage/availability.svelte.ts`: runtime config global.
- `src/lib/utils/file.ts`: file-open picker.
- `static/templates/home-lab.rackula.yaml`, `static/templates/network-closet.rackula.yaml`, `static/templates/media-server.rackula.yaml`: shipped starters.
- `vite.config.ts`: `publicDir`.
- `e2e/playwright.config.ts`, `e2e/multi-rack.spec.ts`: Playwright config and the only multi-rack scale assertion.
- `e2e/helpers/test-layouts.ts`, `e2e/helpers/toolbar-actions.ts`, `e2e/helpers/visual.ts`, `e2e/helpers/multi-context.ts`: layout-loading patterns in E2E.
- `performance-budget.json`, `scripts/check-bundle-budget.ts`, `scripts/performance-benchmark.ts`, `docs/research/performance-baseline.md`: bundle budget and render baseline.
- `docs/guides/BRAND-PACKS.md`, `docs/guides/NETBOX-IMPORT.md`: contributor guides.
- `docs/reference/SCHEMA.md`: schema versioning policy.
- `docs/research/2178-device-library-filters.md`: palette filter spike.
- `docs/research/2622-codebase.md`, `docs/research/2622-patterns.md`: depth model spike (M021).
- `ACKNOWLEDGEMENTS.md`: licence sources.
- `CHANGELOG.md`: hot-path audit entry.
- `package.json`: dependency versions.
- `node_modules/simple-icons/icons/nvidia.svg`, `node_modules/simple-icons/index.d.ts`: NVIDIA icon availability.
- GitHub issues #2627, #2635, #272, #3117, #356, #114: current state.

## 1. Brand pack mechanics

A device type is `DeviceTypeSchema` at `src/lib/schemas/index.ts:444-530`, a flat NetBox-shaped object with `.passthrough()` (`src/lib/schemas/index.ts:508`). Fields available today:

- Identity: `slug` (required), `manufacturer`, `model`, `part_number` (`src/lib/schemas/index.ts:447-450`).
- Height: `u_height` 0.5 to 50 in 0.5 steps (`src/lib/schemas/index.ts:453-457`). `MAX_DEVICE_HEIGHT` is 42 (`src/lib/types/constants.ts:72`), stricter than the schema; a 10U DGX fits either way.
- Width: `slot_width` 1 (half) or 2 (full) (`src/lib/schemas/index.ts:458`, `src/lib/schemas/index.ts:120`) and `rack_widths` from 10, 19, 21, 23 (`src/lib/schemas/index.ts:459`, `src/lib/schemas/index.ts:126-131`); omitted means 19-inch compatible (`src/lib/types/index.ts:462-467`).
- Depth: `is_full_depth` boolean only (`src/lib/schemas/index.ts:460`). No `depth_mm` on DeviceType (section 12).
- Power: `is_powered` (`src/lib/schemas/index.ts:461`), `power_ports[]` with numeric `maximum_draw` and `allocated_draw` (`src/lib/schemas/index.ts:331-338`, `src/lib/schemas/index.ts:486`), `power_outlets[]` with `feed_leg` A/B/C (`src/lib/schemas/index.ts:343-350`, `src/lib/schemas/index.ts:487`), integer `va_rating` (`src/lib/schemas/index.ts:495-499`). `outlet_count` exists only in the TS type (`src/lib/types/index.ts:527`).
- Weight and airflow: `weight` plus `weight_unit` kg or lb (`src/lib/schemas/index.ts:462-463`); `airflow` with 7 NetBox values (`src/lib/schemas/index.ts:464`, `src/lib/schemas/index.ts:102-110`).
- Image flags: `front_image`, `rear_image` booleans (`src/lib/schemas/index.ts:467-468`).
- Display: required hex `colour` (`src/lib/schemas/index.ts:471-473`), required `category` (`src/lib/schemas/index.ts:474`), `tags` (`src/lib/schemas/index.ts:475`).
- Metadata: `notes`, `serial_number`, `asset_tag`, `links`, `custom_fields` (`src/lib/schemas/index.ts:478-482`).
- Components: `interfaces[]` (`src/lib/schemas/index.ts:485`), `device_bays[]`, `inventory_items[]` (`src/lib/schemas/index.ts:488-489`), `subdevice_role` (`src/lib/schemas/index.ts:492`), container `slots[]` (`src/lib/schemas/index.ts:506`).
- Console ports: not found. The in-app NetBox importer drops them with a warning (`src/lib/utils/netbox-import.ts:570-579`).
- Rule: a half-depth device cannot have interfaces on both faces (`src/lib/schemas/index.ts:509-530`).

What a DGX-class pack can and cannot express:

- Can express: correct U height, 19-inch width, full depth as a boolean, weight in kg, airflow direction, per-PSU `maximum_draw` in `power_ports[]`, colour, category, spec-sheet links.
- Stored but never surfaced: `weight` (no component reads it; only `src/lib/utils/netbox-import.ts:489-502` and `src/lib/utils/yaml-field-order.ts:45` touch it), `airflow` (only defaulted in `src/lib/data/brandPacks/index.ts:288-301` and shown in the import preview `src/lib/components/ImportFromNetBoxDialog.svelte:315-318`), and `maximum_draw` / `va_rating` (no consumer outside the schema and the NetBox importer). A pack can carry these values but users will not see them rendered or summed.
- Cannot express: OSFP or InfiniBand ports (the enum tops out at `400gbase-x-qsfpdd`, `src/lib/schemas/index.ts:153`), millimetre depth, a GPU or accelerator category.
- No existing pack declares `interfaces`, `weight`, `va_rating` or `power_ports` (an `rg -c` for each over `src/lib/data/brandPacks/` returns no matches). `airflow:` appears 354 times and `is_full_depth: false` 385 times across roughly 685 `slug:` entries.
- No pack mentions NVIDIA, Mellanox, DGX, HGX, GPU, InfiniBand or OSFP. The nearest precedent is the Dell PowerEdge M1000e at 10U (`src/lib/data/brandPacks/dell.ts:283-284`) and MX7000 at 7U (`src/lib/data/brandPacks/dell.ts:291-292`), both plain `server` entries.

DeviceCategory: `DeviceCategorySchema` (`src/lib/schemas/index.ts:56-71`) has 14 values: server, network, firewall, patch-panel, power, storage, kvm, av-media, cooling, shelf, blank, cable-management, chassis, other. There is no gpu, compute or accelerator category, so a DGX node is `server`. The TS union mirrors it (`src/lib/types/index.ts:38-52`). Adding a category touches `CATEGORY_COLOURS` (`src/lib/types/constants.ts:15`), `ALL_CATEGORIES` (`src/lib/types/constants.ts:38-53`), `categoryOrder` and its dev assertion (`src/lib/utils/deviceFilters.ts:20-34`, `src/lib/utils/deviceFilters.ts:36-64`), the display-name map (`src/lib/utils/deviceFilters.ts:217`), both icon maps (`src/lib/components/CategoryIcon.svelte:33`, `src/lib/components/CategoryIconSVG.svelte:36`) and the share abbreviation map (`src/lib/schemas/share.ts:44-59`). It is also a strict enum change, so prior releases would reject such layouts (section 3).

Registration and display:

- One entry in `BRAND_PACK_REGISTRY` (`src/lib/data/brandPacks/index.ts:76-172`) with the `BrandSection` shape {id, title, devices, icon} (`src/lib/data/brandPacks/index.ts:54-61`).
- `getBrandPacks()` sorts sections A-Z by title and devices A-Z, sets `defaultExpanded: false` on every pack, and memoises the result (`src/lib/data/brandPacks/index.ts:178-199`).
- The palette section header renders `BrandIcon` plus `section.title` (`src/lib/components/DevicePalette.svelte:734-737`). The icon slug must also be added to `iconMap` (`src/lib/components/BrandIcon.svelte:47-75`), otherwise a Zap fallback renders (`src/lib/components/BrandIcon.svelte:92-96`).
- simple-icons ships an NVIDIA glyph (`node_modules/simple-icons/icons/nvidia.svg`, `siNvidia` export in `node_modules/simple-icons/index.d.ts`), so the icon step is one import and one map entry.
- The guide accepts enterprise gear with accuracy as the bar (`docs/guides/BRAND-PACKS.md:14-20`) and says the pack test is registry-parameterised, so no test edits are needed (`docs/guides/BRAND-PACKS.md:130`).

## 2. NetBox import pipeline

Two pipelines exist with different field coverage.

Script pipeline, the one `docs/guides/NETBOX-IMPORT.md:14` documents (`scripts/import-netbox-devices.ts`):

- Reads NetBox YAML into a narrow `NetBoxDevice`: manufacturer, model, slug, u_height, is_full_depth, front_image, rear_image, airflow, weight, weight_unit, subdevice_role, comments (`scripts/import-netbox-devices.ts:52-65`). It never reads `interfaces`, `power_ports`, `console_ports` or `module_bays`.
- Emits TypeScript with slug, u_height, manufacturer, model, `is_full_depth` (default true), `colour` from `CATEGORY_COLOURS`, `category`, and optionally front_image, rear_image and airflow (`scripts/import-netbox-devices.ts:249-289`). Weight is parsed but never written.
- Category is a substring heuristic that defaults to `server` (`scripts/import-netbox-devices.ts:227-247`).
- Devices under 1U are skipped (`scripts/import-netbox-devices.ts:544-547`).
- Output goes to `src/lib/data/brandPacks/<vendor lowercased>.ts` with a `<vendor>Devices` array, so `--vendor NVIDIA` would write `nvidia.ts` / `nvidiaDevices` (`scripts/import-netbox-devices.ts:291-295`, `scripts/import-netbox-devices.ts:358-359`). Registration and the icon stay manual (`scripts/import-netbox-devices.ts:578-587`).
- Images are imported. It downloads `{slug}.front|rear.png` (falling back to `.jpg`) from NetBox `elevation-images/{Vendor}/` into `assets-source/device-images/<vendor>/` (`scripts/import-netbox-devices.ts:438-486`), then runs `process-images` for that vendor and `generate-bundled-images` (`scripts/import-netbox-devices.ts:589-610`).
- The documented field mapping is `docs/guides/NETBOX-IMPORT.md:87-98`.

In-app pipeline (ImportFromNetBoxDialog via `src/lib/utils/netbox-import.ts`), which creates a layout-scoped custom device type rather than a pack entry:

- Reads interfaces, console ports, power ports and outlets, device bays, module bays and inventory items (`src/lib/utils/netbox-import.ts:32-54`).
- Interface types go through `InterfaceTypeSchema.safeParse`. An unmapped value, such as the brief's `800gbase-x-osfp` or `infiniband-ndr` or anything else outside the enum, becomes `"other"` with the warning `Unknown interface type: ..., using "other"` (`src/lib/utils/netbox-import.ts:363-377`). The port survives but its real type is lost.
- Power ports keep `maximum_draw` and `allocated_draw` (`src/lib/utils/netbox-import.ts:524-532`). Weight is kept, defaulting to kg (`src/lib/utils/netbox-import.ts:489-502`). Console ports are dropped with a warning (`src/lib/utils/netbox-import.ts:570-579`). `module_bays` is declared (`src/lib/utils/netbox-import.ts:51`) but never mapped.
- Images: only the boolean flags are copied (`src/lib/utils/netbox-import.ts:481-487`); no image bytes are fetched.
- Category gotcha: any interface whose type contains `base` forces `network` (`src/lib/utils/netbox-import.ts:214`), and this is checked before the server rules (`src/lib/utils/netbox-import.ts:271-287`). A DGX node imported this way with Ethernet interfaces would be classed as a network device unless the user overrides it.
- The result is schema-validated before it enters the library (`src/lib/utils/netbox-import.ts:585-593`).

Auxiliary scripts: `scripts/bulk-import-netbox.ts` (generates a 500+ device starterLibrary, `scripts/bulk-import-netbox.ts:3-6`), `scripts/curated-import.ts` (about 420-device library, `scripts/curated-import.ts:3-4`), `scripts/generate-netbox-homelab-candidates.ts` (ranked homelab candidates CSV, `scripts/generate-netbox-homelab-candidates.ts:3-6`).

## 3. InterfaceTypeSchema

`InterfaceTypeSchema` is a strict `z.enum` (`src/lib/schemas/index.ts:136-192`). The project `z` only sets `jitless` and adds no tolerance (`src/lib/zod.ts:12`). Current values:

- Copper: 100base-tx, 1000base-t, 2.5gbase-t, 5gbase-t, 10gbase-t.
- SFP family: 1000base-x-sfp, 10gbase-x-sfpp, 25gbase-x-sfp28.
- QSFP family: 40gbase-x-qsfpp, 100gbase-x-qsfp28, 100gbase-x-qsfpdd, 200gbase-x-qsfp56, 200gbase-x-qsfpdd, 400gbase-x-qsfpdd.
- Console and management: console, management, usb-a, usb-b, usb-c, usb-mini-b, usb-micro-b.
- Virtual: virtual, lag.
- Pro audio: xlr-3, trs-1-4, ts-1-4, rca, adat-optical, midi-din, bnc, db25-audio, phoenix, speakon, xlr-5.
- Video: displayport, hdmi, sdi-bnc, vga.
- Control: dmx-xlr, rs-232, rs-422.
- Other AV: aes3, avb, dante.
- Catch-all: other.

There is no OSFP, QSFP112, 800G or InfiniBand (HDR/NDR) value.

Dual source, still present: the hand-written union in `src/lib/types/index.ts:130-185` currently matches the Zod enum value for value, but they are separate declarations. Components import the union from `$lib/types` (for example `src/lib/components/PortIndicators.svelte:15-22`), while `src/lib/schemas/index.ts:1129` exports a separate inferred type. I found no compile-time link that fails when only one is edited.

Storage: each port's type is saved twice, on the template (`InterfaceTemplateSchema.type`, `src/lib/schemas/index.ts:317`) and on each placed port (`PlacedPortSchema.type`, `src/lib/schemas/index.ts:401`; cached "for cable routing" per `src/lib/types/index.ts:380-381`).

Consumers:

- Port colours: `INTERFACE_COLORS` is partial and covers only 1000base-t, 10gbase-t, 10gbase-x-sfpp, 25gbase-x-sfp28, 40gbase-x-qsfpp and 100gbase-x-qsfp28 (`src/lib/components/PortIndicators.svelte:85-92`). Everything else falls back to a category colour (`src/lib/components/PortIndicators.svelte:94-99`, `src/lib/components/PortIndicators.svelte:109-111`). Tokens are in `src/lib/styles/tokens.css:265-267`. 200G and 400G ports already render in the generic network colour.
- Category: `getPortCategory` is a string heuristic (AV set, then console/usb/serial, then power/iec/nema, else `network`) (`src/lib/utils/port-utils.ts:62-83`). A new `*-osfp` or InfiniBand value would categorise as network with no code change.
- Direction: `inferDirection` returns bidirectional for network types (`src/lib/utils/port-utils.ts:99-113`).
- Tooltip label: partial `TYPE_LABELS` that falls back to the raw type string (`src/lib/components/PortTooltip.svelte:24`, `src/lib/components/PortTooltip.svelte:59`).
- Compatibility: connection validation warns, never blocks. It warns on a category mismatch, and on an exact type mismatch within the same category (`src/lib/stores/connection.svelte.ts:123-139`). A QSFP-DD to OSFP breakout would warn "Port types do not match".
- Grouped badges are keyed by type (`src/lib/components/PortIndicators.svelte:151-170`).
- The in-app NetBox import validates against the enum (`src/lib/utils/netbox-import.ts:367`).
- The published JSON Schema embeds the enum three times (`static/schemas/rackula-layout.schema.json:194`, `static/schemas/rackula-layout.schema.json:698`, `static/schemas/rackula-layout.schema.json:1010`).

What an older release does when it reads a new enum value: it rejects the whole layout. Nothing is stripped or passed through.

- File/YAML door: the version gate compares only the MAJOR of `metadata.schema_version` (`src/lib/utils/yaml.ts:332`, `src/lib/schemas/migrations.ts:50`), so a same-MAJOR file passes. `LayoutSchemaBase.safeParse` then fails on the unknown member, and `validateParsedLayout` throws `describeValidationIssues` (`src/lib/utils/yaml.ts:355-361`), which words `invalid_value` as "must be one of the supported options" (`src/lib/utils/import-errors.ts:191`). `.passthrough()` keeps unknown keys, not unknown enum values.
- Browser storage door: `parseLayoutObject` returns null (`src/lib/utils/yaml.ts:281-284`), so `loadLayoutBody` returns `{ ok: false }` and the tab lands in the orphan/error state (`src/lib/storage/browser-workspace.ts:242-246`).
- Share links: unaffected, because they carry no interfaces or ports (section 11).
- Policy conflict: `docs/reference/SCHEMA.md:56` classes "enum widening" as MINOR (additive), and `docs/reference/SCHEMA.md:45` promises that same-MAJOR files load under a tolerant reader. With a strict `z.enum`, widening is in practice breaking for every prior release. This is the main schema gate on OSFP or InfiniBand ports.
- Version constant: `SCHEMA_VERSION = "1.1"` (`src/lib/schemas/migrations.ts:21`), but writers still default `schema_version` to `"1.0"` (`src/lib/utils/yaml.ts:130`, `src/lib/storage/manager.svelte.ts:524`, `src/lib/utils/archive.ts:156`, `src/lib/utils/serialization.ts:27`), and `docs/reference/SCHEMA.md:30` still says 1.0 is current. Nothing I found stamps `SCHEMA_VERSION` on save, and no code reads the MINOR, so a MINOR bump changes no behaviour.

What adding an enum value requires:

1. Edit both `InterfaceTypeSchema` (`src/lib/schemas/index.ts:136`) and the `InterfaceType` union (`src/lib/types/index.ts:130`).
2. Run `npm run generate-schema` (`scripts/generate-schema.ts:32-37`, `scripts/generate-schema.ts:86-107`). The drift guard checks structure and exact bytes (`src/tests/layout-json-schema.test.ts:33-44`).
3. Add an upgrade-corpus fixture.
   - `scripts/check-corpus-freshness.sh` treats any diff under `src/lib/schemas`, `src/lib/utils/yaml.ts`, `src/lib/utils/serialization.ts`, `src/lib/storage/migrate-layout.ts` or `src/lib/storage/adapt-legacy-layout.ts` since the last `v*` tag as a schema change (`scripts/check-corpus-freshness.sh:12-18`). It fails unless at least one new `*.rackula.yaml` was added under `src/tests/fixtures/upgrade-corpus/` (`scripts/check-corpus-freshness.sh:34-42`).
   - Use `scripts/add-corpus-fixture.sh` (`scripts/add-corpus-fixture.sh:2-9`) and follow `src/tests/fixtures/upgrade-corpus/README.md:23-30`.
   - Landmine, still true: a rack-level device at position 1 to 5 (internal units) trips `needsPositionMigration` (`src/lib/schemas/migrations.ts:103-108`), and the transform then restamps `version` (`src/lib/schemas/index.ts:862`).
4. A `SCHEMA_VERSION` change is not mechanically required.
   - For prior releases to fail cleanly with "created by a newer version of Rackula" (`src/lib/schemas/migrations.ts:51-54`) instead of a validation error, the MAJOR would have to move to 2. The corpus already has a reject fixture for that path (`src/tests/fixtures/upgrade-corpus/schema-version-future.rackula.yaml:5`, asserted in `src/tests/upgrade-corpus.test.ts:56-63`).
   - The alternative is to ship a tolerant reader (unknown type mapped to `"other"`) at least one release before any layout uses the new values.
5. Optional: colour tokens and tooltip labels. Both are partial maps, so they are not required.

## 4. Starter templates

Load path from `static/templates/*.rackula.yaml` to an open tab:

1. Opening the "+" chevron calls `ensureStartersLoaded` (`src/lib/components/NewLayoutMenu.svelte:60-62`). The mobile sheet and command palette use the same shared source (`src/lib/components/mobile/MobileLayoutsSheet.svelte:12-17`).
2. `ensureStartersLoaded` shares one in-flight load and caches a non-empty result for the session (`src/lib/stores/starter-templates.svelte.ts:41-71`).
3. `loadStarterTemplates` fetches every `TEMPLATE_FILES` entry in parallel (`src/lib/templates/starter-templates.ts:128-135`) from `${BASE_URL}templates/<id>.rackula.yaml` (`src/lib/templates/starter-templates.ts:89-91`). `static/` is Vite's `publicDir` (`vite.config.ts:153`), so templates are separate static files fetched lazily on first menu open, not bundled into JS.
4. Each file goes through `parseLayoutYaml` (`src/lib/utils/yaml.ts:383-386`): version gate, `LayoutSchemaBase`, `adaptLegacyLayout`, then full `LayoutSchema` (`src/lib/utils/yaml.ts:326-375`). Any failure makes that template silently absent (`src/lib/templates/starter-templates.ts:98-119`).
5. `openStarter` snapshots and clones the layout, regenerates only `metadata.id`, and calls `workspace.openTab` (`src/lib/stores/starter-templates.svelte.ts:85-92`). `openTab` runs the store `loadLayout`, passing the device ids that are live in other tabs (`src/lib/stores/workspace.svelte.ts:175`, `src/lib/stores/workspace.svelte.ts:191`).
6. `loadLayout` adapts legacy data, deduplicates rack, device and port ids, and remaps group and connection references (`src/lib/stores/layout/layout-lifecycle.ts:35-215`). `fitAll` over racks and rack_groups then runs on the next frame (`src/lib/stores/starter-templates.svelte.ts:97-100`).

Would a multi-rack template with `rack_groups` and `connections[]` load as-is? Structurally yes. `LayoutSchemaInput` accepts `racks[]`, `rack_groups` and `connections` (`src/lib/schemas/index.ts:768-774`). `loadLayout` keeps groups and connections and remaps them only when ids had to be regenerated (`src/lib/stores/layout/layout-lifecycle.ts:128-138`, `src/lib/stores/layout/layout-lifecycle.ts:182-214`). Conditions a POD template must meet:

- Positions in internal units. All three shipped starters store U values with `version: "1.0.0"` (for example position 12 in a 12U rack at `static/templates/home-lab.rackula.yaml:22`).
  - They load correctly only because each has a device at U1 to U5: home-lab at 2 and 4, network-closet at 1, 3, 4 and 5, media-server at 3. That trips the legacy heuristic (`src/lib/schemas/migrations.ts:103-108`), which rescales every position.
  - A tall POD rack authored the same way, with nothing below U6, would not trigger it. The positions would be read as internal units and fail the whole-U rail rule (`src/lib/schemas/index.ts:977-985`), and the template would silently vanish from the menu.
- Embedded device types.
  - Racks resolve slugs only from `layout.device_types`: `src/lib/components/RackCanvasView.svelte:656-658` passes `layoutStore.device_types`, and `src/lib/components/Rack.svelte:195-202` looks slugs up in it.
  - An unresolved device is simply not rendered (`src/lib/components/Rack.svelte:583`).
  - The shipped starters already embed their types (`static/templates/home-lab.rackula.yaml:54-84`).
- Explicit port ids.
  - `ports` defaults to `[]` (`src/lib/schemas/index.ts:550`).
  - `instantiatePorts` runs only on placement or duplication (`src/lib/stores/layout/device-actions.ts:124`, `src/lib/stores/layout/device-actions.ts:213`, `src/lib/stores/layout/device-actions.ts:427`, `src/lib/stores/layout/device-actions.ts:437`, `src/lib/stores/layout/recorded-device-actions.ts:173`), never on load.
  - A pre-wired template must therefore write out every `PlacedPort` (id, template_name, template_index, type) and point `connections[]` at those ids.

Single-rack assumptions:

- `starterRackSummary` already pluralises ("N racks, M devices") and has no connection count (`src/lib/templates/starter-templates.ts:71-80`).
- There is no thumbnail in either starter menu. Desktop rows show a colour dot, the name and the summary (`src/lib/components/NewLayoutMenu.svelte:98-113`), and mobile rows are the same (`src/lib/components/mobile/MobileLayoutsSheet.svelte:219-236`).
  - The Layouts sidebar thumbnail uses the export renderer and passes rack_groups (`src/lib/components/layout-preview-render.ts:44-55`), so multi-rack previews work once the layout is open.
  - Export has no connection rendering: no "connection" match under `src/lib/utils/export`.
- Typing: `StarterTemplateId` is derived from the `TEMPLATE_FILES` const tuple (`src/lib/templates/starter-templates.ts:41-48`), so the union updates itself. `STARTER_COLOURS: Record<StarterTemplateId, string>` (`src/lib/templates/starter-templates.ts:56-60`) then forces a colour entry at compile time.
- Not data-only in practice.
  - The header says "No component code changes" (`src/lib/templates/starter-templates.ts:7-11`).
  - However, command-palette entries are hard-coded per starter (`src/lib/actions/registry.ts:490-515`), with a matching dispatch map (`src/lib/actions/dispatch.ts:201-206`).
  - A new starter that should be reachable from the palette needs both.
- Flat menu: every starter lists in one "From template" group with no category or grouping (`src/lib/components/NewLayoutMenu.svelte:93-116`). POD templates would sit alongside the homelab ones.

Fetch cost and size limits:

- The three current files are 2089, 1829 and 2211 bytes.
- Every starter is fetched on first open, whichever one the user wants (`src/lib/templates/starter-templates.ts:131-133`), so a large POD template costs every user who opens the menu.
- The loader has no size limit. js-yaml itself loads lazily (`src/lib/utils/yaml.ts:60-67`).

## 5. Multi-rack layout and rack groups

- Positioning: one bottom-aligned horizontal row ordered by `Rack.position`, an integer order index (`src/lib/schemas/index.ts:639`).
  - The canvas comment says "There is no free 2D placement" (`src/lib/components/RackCanvasView.svelte:600-607`).
  - `organizeRackRow` keeps each group's members contiguous, in the row slot of the group's lowest-position member. A rack listed in two groups belongs to the first only (`src/lib/utils/rack-row.ts:11-64`).
  - Fit-all geometry comes from `racksToPositionsWithIds`: x accumulates with `RACK_GAP`, and y is bottom-aligned (`src/lib/utils/canvas.ts:394-469`).
- Sizes:
  - `BASE_RACK_WIDTH` is 220 px for 19-inch, `U_HEIGHT_PX` is 22, and `DUAL_VIEW_GAP` and `RACK_GAP` are both 24 (`src/lib/constants/layout.ts:24`, `src/lib/constants/layout.ts:36`, `src/lib/constants/layout.ts:68`, `src/lib/constants/layout.ts:91`).
  - An ungrouped dual-view rack is `2 x rackWidthPx + DUAL_VIEW_GAP` wide, about 464 px at 19-inch (`src/lib/utils/canvas.ts:317-333`).
- Bayed preset: `BayedRackView` stacks a front row over a rear row with bays flush (`src/lib/components/RackCanvasView.svelte:744-813`, `src/lib/utils/canvas.ts:342-367`). It needs equal heights (`src/lib/schemas/index.ts:930-946`) and at least 2 racks (`src/lib/stores/layout/rack-groups.ts:225-233`).
- Row preset: a labelled container (`group.name ?? "Group"`) holding one `RackDualView` per member (`src/lib/components/RackCanvasView.svelte:814-857`). `canvas.ts` does not model row groups and treats their members as ungrouped racks (`src/lib/utils/canvas.ts:401-403`), so the group label is left out of the fit-all bounds.
- Rack count: `MAX_RACKS = 10` (`src/lib/types/constants.ts:86-90`).
  - It is enforced only on the add, duplicate and bay paths (`src/lib/stores/layout.svelte.ts:212`, `src/lib/stores/layout/rack-actions.ts:311`, `src/lib/stores/layout/rack-actions.ts:402`, `src/lib/stores/layout/rack-actions.ts:595-596`, `src/lib/stores/layout/rack-groups.ts:454`, `src/lib/stores/layout/rack-groups.ts:620`, `src/lib/stores/layout/rack-groups.ts:836`), and pinned by `e2e/multi-rack.spec.ts:56-71`.
  - Neither `LayoutSchema` nor `loadLayout` checks it. A file with more racks loads, but the user cannot add another rack until the count drops below 10.
- Height: the schema allows 1 to 100U (`src/lib/schemas/index.ts:624-628`, `src/lib/schemas/index.ts:662-666`), `MAX_RACK_HEIGHT` is 100 (`src/lib/types/constants.ts:66`), and the UI inputs cap at 100 (`src/lib/components/EditPanelRack.svelte:322`, `src/lib/components/RackEditSheet.svelte:218`).
  - Presets are 12, 18, 24, 42 and 48 (`src/lib/types/constants.ts:58-60`).
  - 48U is a preset; 52U works but must be typed in.
- Width: 10, 19, 21 or 23 inches (`src/lib/schemas/index.ts:629-634`, `src/lib/components/EditPanelRack.svelte:51`).
- Depth: `depth_mm`, default 1000, with presets from 450 to 1200 (`src/lib/schemas/index.ts:642`, `src/lib/types/constants.ts:117-132`). There is no `mounting_depth_mm` (section 12).
- Group fields: `id`, optional `name` (max 100), `rack_ids` (min 1, no max), optional `layout_preset` bayed or row, plus `.passthrough()` (`src/lib/schemas/index.ts:697-706`).
  - There is no power budget, fabric membership, scalable-unit or role field, and groups cannot nest.
  - Unknown group fields survive in memory, but the serialiser writes known fields only (`docs/reference/SCHEMA.md:610`), so ad-hoc group metadata is lost on save.
- "A row of 9 racks": expressible as one row group. Nine is under `MAX_RACKS`, so it can also be built interactively, and it is roughly 4.4k px wide at 100 percent zoom.
- SuperPOD scalable unit: a unit made of compute racks plus management racks cannot be built interactively, because of `MAX_RACKS`. There is also no hierarchy (SU, row, rack) beyond one flat group level.

## 6. Connections at scale

Port model:

- `DeviceType.interfaces[]` (`InterfaceTemplateSchema`, `src/lib/schemas/index.ts:314-326`) is turned into `PlacedDevice.ports[]` at placement by `instantiatePorts` (`src/lib/utils/port-utils.ts:216-234`; `src/lib/schemas/index.ts:393-406`).
  - It creates one `PlacedPort` per template: `id` from `generateId` (crypto.randomUUID, `src/lib/utils/device.ts:13-17`), `template_name`, `template_index` and a cached `type`.
- A `Connection` is {id, a_port_id, b_port_id, label, color}, with a no-self-link refine (`src/lib/schemas/index.ts:416-434`). Connections live in `layout.connections` (`src/lib/schemas/index.ts:774`).
- Port ids can be any non-empty string. On load they are deduplicated layout-wide and connection endpoints are remapped (`src/lib/stores/layout/layout-lifecycle.ts:140-206`). Dangling connections are dropped by the legacy adapter (`src/lib/storage/adapt-legacy-layout.ts:567`, `src/lib/storage/adapt-legacy-layout.ts:703`).

Anchors: `computeVisiblePortLayout` places the ports visible on the current face in one centred row, 8 px apart and 8 px above the device bottom (`src/lib/utils/port-geometry.ts:22-25`, `src/lib/utils/port-geometry.ts:122-145`). It returns `[]` once the visible count exceeds `HIGH_DENSITY_THRESHOLD = 24` (`src/lib/utils/port-geometry.ts:33`, `src/lib/utils/port-geometry.ts:129-131`), and `getPortAnchors` then yields nothing (`src/lib/utils/port-geometry.ts:154-162`).

Grouped mode (landmine confirmed, still true):

- `PortIndicators` switches to one count badge per interface type, with no circles, hit targets or tooltips (`src/lib/components/PortIndicators.svelte:129-132`, `src/lib/components/PortIndicators.svelte:151-186`, `src/lib/components/PortIndicators.svelte:316-336`).
- A connection with an endpoint on such a device is skipped entirely. It is not drawn, and it is not anchored at the device centre.
  - `buildPortAnchorMap` gets no anchors for the device (`src/lib/utils/connection-path.ts:477-495`, `src/lib/utils/connection-path.ts:518-525`).
  - `buildRenderedConnections` drops any connection missing either anchor (`src/lib/utils/connection-path.ts:562-591`, the check at `src/lib/utils/connection-path.ts:572-574`).
  - A centre fallback was deliberately rejected as misleading (`src/lib/utils/connection-path.ts:551-561`). The data is kept and reappears if the device drops under the threshold.
- Such connections cannot be created in the UI either. There is no hit target, and the click handler ignores ports without an id (`src/lib/utils/connection-creation.ts:111-122`).
- The threshold counts ports on the visible face only (`src/lib/utils/port-geometry.ts:105-114`), so a device with at most 24 ports per face stays addressable.
  - Every DGX fabric switch in the brief exceeds 24 on its port face; a DGX node's own rear ports may not.
  - The generic `48-port-switch` in the starter library is already in grouped mode (`src/lib/data/starterLibrary.ts:82-88`).
  - Multi-row port layout is #356, open in M009.

Other skip causes:

- Container-child ports (#3117, open, no milestone): `RackDevice` renders `PortIndicators` only for the device itself (`src/lib/components/RackDevice.svelte:852-861`). The container-children block (`src/lib/components/RackDevice.svelte:876-878`) has none, and `ConnectionLayer` receives top-level devices only (`src/lib/components/Rack.svelte:262-281`, `src/lib/components/ConnectionLayer.svelte:29-37`).
- Opposite face: `RackDualView` mounts separate front and rear `Rack` instances (`src/lib/components/RackDualView.svelte:340-349`, `src/lib/components/RackDualView.svelte:370-379`), and each anchors only its own face's ports. A link from a front-facing switch port to a rear-facing node port is drawn in neither.
- Cross-rack (#272, open in M009): not drawn today.
  - `ConnectionLayer` is mounted per `Rack`, with only that rack and face's devices (`src/lib/components/Rack.svelte:275-281`, `src/lib/components/Rack.svelte:630-635`).
  - It routes through a gutter beside that rack's own bounds (`src/lib/components/ConnectionLayer.svelte:61-66`, `src/lib/utils/connection-path.ts:92-108`).
  - The component header lists "cross-rack endpoint" as a skip case (`src/lib/components/ConnectionLayer.svelte:12-17`).
  - The data model does allow cross-rack links. Validation searches every rack (`src/lib/stores/connection.svelte.ts:46-55`) and has no same-rack rule (`src/lib/stores/connection.svelte.ts:69-142`), and port dedup is layout-wide because connections may span racks (`src/lib/stores/layout/layout-lifecycle.ts:140-148`).

Performance characteristics:

- Every `Rack` face iterates the entire layout connection list (`src/lib/components/ConnectionLayer.svelte:68-74`, `src/lib/utils/connection-path.ts:571-588`).
  - There are two instances per rack (`src/lib/components/RackDualView.svelte:340`, `src/lib/components/RackDualView.svelte:370`), and bayed members mount their own (`src/lib/components/BayedRackView.svelte:453`, `src/lib/components/BayedRackView.svelte:567`).
  - So one recompute is O(faces x connections), and it re-runs whenever the connections or the rendered device set change.
- `buildPortAnchorMap` runs `ports.find` for each anchor (`src/lib/utils/connection-path.ts:527-531`). That is O(anchors x ports) per device, bounded by the 24-anchor cap.
- `validateConnection` rebuilds the flat port list on every call (`src/lib/stores/connection.svelte.ts:50-55`), then linearly scans ports and connections (`src/lib/stores/connection.svelte.ts:84-118`).
  - Adding N connections one at a time through the store is O(N x (ports + connections)), which is quadratic when a fabric is built interactively.
  - Loading from a file skips this validation.
- Each rendered connection is one `ConnectionPath` with a visible path, a trimmed hit path and an optional arrow (`src/lib/components/ConnectionLayer.svelte:78-80`, `src/lib/utils/connection-path.ts:349-411`). Routing only alternates between the left and right gutters, with no bundling (`src/lib/utils/connection-path.ts:82-84`).
- There is no benchmark or test for connection count (section 11).

## 7. Power

- Per device: `is_powered`, `power_ports[].maximum_draw` and `allocated_draw` (watts by NetBox convention), `power_outlets[].feed_leg`, and `va_rating` (`src/lib/schemas/index.ts:331-350`, `src/lib/schemas/index.ts:461`, `src/lib/schemas/index.ts:486-487`, `src/lib/schemas/index.ts:495-499`). No component, store or export reads `maximum_draw`, `allocated_draw` or `va_rating`. A search of `src/lib` finds only the schema, the TS types and the NetBox importer.
- Rack and group: `RackSchema` has `depth_mm` and `base_weight`, but no power budget, feed or phase fields (`src/lib/schemas/index.ts:655-687`). `RackGroupSchema` has none either (`src/lib/schemas/index.ts:697-706`).
- Power connections: none.
  - The interface enum has no power inlet or outlet types.
  - `getPortCategory` would recognise `power`, `iec` or `nema` substrings (`src/lib/utils/port-utils.ts:79-81`), but no such value can pass the enum.
  - Nothing links `power_ports` to `power_outlets`.
- PDUs:
  - The starter library has rack-mounted half-depth `1u-pdu` and `2u-pdu`, plus `2u-ups` and `4u-ups` (`src/lib/data/starterLibrary.ts:96-112`), and a half-width `1u-mini-ups` (`src/lib/data/starterLibrary.ts:794-800`).
  - There is no zero-U or vertical PDU. Rails are whole-U only (`src/lib/schemas/index.ts:977-985`) and there is no side-mount concept.
  - The APC, Eaton, Vertiv and CyberPower packs (`src/lib/data/brandPacks/index.ts:124-133`) carry no `power_ports` or `va_rating`.
- Showing ">25 kW per rack" today: free text only. The options are rack `notes` (max 1000, `src/lib/schemas/index.ts:679`), device or placement `notes` and `custom_fields` (`src/lib/schemas/index.ts:478-482`, `src/lib/schemas/index.ts:580-581`), a rack or group name, or an annotation column showing notes (`src/lib/types/index.ts:89-90`). Nothing computes a total.
- Roadmap: power distribution is scoped to milestone M009 "Connectivity & Power Extensions", per the milestone description attached to #272.

## 8. Generic and unbranded devices

- Starter library (`src/lib/data/starterLibrary.ts:53-809`):
  - Servers 1U to 4U (`src/lib/data/starterLibrary.ts:54-58`).
  - Router/firewall.
  - 24- and 48-port switches with `1000base-t` interfaces (`src/lib/data/starterLibrary.ts:76-88`).
  - Storage 1U to 4U (`src/lib/data/starterLibrary.ts:90-94`).
  - PDU and UPS (`src/lib/data/starterLibrary.ts:96-112`).
  - Patch panels, KVM, AV, fan panels, shelves, carriers and `generic-mini-pc`.
  - 4U and 7U blade chassis with server bays (`src/lib/data/starterLibrary.ts:581-662`).
  - Blanks, cable management and half-width gear.
  - `getStarterLibrary` builds these types with no `manufacturer` and category colours (`src/lib/data/starterLibrary.ts:818-834`). They form the palette's Generic section, expanded by default (`src/lib/components/DevicePalette.svelte:303-322`, `src/lib/components/DevicePalette.svelte:443-448`).
- Missing for a POD:
  - A 10U GPU server.
  - A generic 32- or 64-port 400G or InfiniBand switch.
  - A generic OOB switch with uplink ports.
  - A storage appliance taller than 4U.
- Neutral partner gear in a template:
  - A layout carries its own required `device_types[]` array (`src/lib/schemas/index.ts:772`), and `manufacturer` is optional (`src/lib/schemas/index.ts:448`).
  - Slugs resolve in the order layout, starter, brand (`src/lib/utils/device-lookup.ts:10-45`).
  - Placing a starter or brand device auto-imports its type into `layout.device_types` (`src/lib/stores/layout/recorded-device-actions.ts:43-59`), so saved layouts are self-contained.
  - A template can therefore define an "x86 control-plane node (2U)" or a "partner storage appliance" as custom types with no vendor. These show as custom devices in that layout's Generic section (`src/lib/components/DevicePalette.svelte:318-320`, `src/lib/utils/device-lookup.ts:62-73`) and match the "Custom only" filter.
  - A layout type that reuses a starter slug shadows the starter (`src/lib/components/DevicePalette.svelte:303-317`).
- Caveats:
  - Custom types exist only inside the layout that carries them, not globally.
  - Images resolve by slug (`src/lib/stores/images.svelte.ts:109-116`), so a custom type gets a bundled image only if it reuses a slug that has one.

## 9. Device library fit

- Sections:
  - `DevicePalette` calls `getBrandPacks()` once (`src/lib/components/DevicePalette.svelte:202`).
  - Brand mode is the default and is persisted under `Rackula-device-grouping` (`src/lib/utils/deviceGrouping.ts:8-31`, `src/lib/components/DevicePalette.svelte:100-110`). It shows Generic, expanded, then one collapsed accordion section per pack in A-Z order (`src/lib/components/DevicePalette.svelte:441-469`, `src/lib/data/brandPacks/index.ts:192-196`).
  - Category mode merges every pack into category sections, with Server expanded by default (`src/lib/components/DevicePalette.svelte:131-141`, `src/lib/components/DevicePalette.svelte:471-493`).
  - Flat mode is one A-Z list (`src/lib/components/DevicePalette.svelte:495-506`).
- Search:
  - Every pack and the combined list go through `searchDevices` (`src/lib/components/DevicePalette.svelte:362-364`, `src/lib/components/DevicePalette.svelte:376-392`, `src/lib/components/DevicePalette.svelte:409-411`).
  - Fuse keys are model (weight 3), manufacturer (2), slug (1) and category (1), with threshold 0.3 and `ignoreLocation` (`src/lib/utils/deviceFilters.ts:72-82`).
  - Multi-word queries AND their tokens by building a Fuse instance per device per token (`src/lib/utils/deviceFilters.ts:88-94`, `src/lib/utils/deviceFilters.ts:114-155`).
  - Because category is a key, "server" matches every server-category device, DGX nodes included.
  - The command palette indexes brand packs too (`src/lib/components/CommandPalette.svelte:43`, `src/lib/components/CommandPalette.svelte:112-127`).
- Filters shipped:
  - `DeviceFilterPopover` offers height buckets, half/full width, has image and custom only (`src/lib/components/DeviceFilterPopover.svelte:24-57`).
  - `filterDevicesByAttributes` is applied in every chain (`src/lib/components/DevicePalette.svelte:351-361`, `src/lib/components/DevicePalette.svelte:379-390`, `src/lib/components/DevicePalette.svelte:398-408`), alongside the rack-width compatibility filter (`src/lib/components/DevicePalette.svelte:353-356`).
  - Filters are session-only by design (`docs/research/2178-device-library-filters.md:32`).
- Not found: a brand or pack filter, a per-pack enable/disable or hide setting, or persisted per-pack collapse state.
- Virtualisation: sections with more than 30 devices use `VirtualList` (`src/lib/components/DevicePalette.svelte:65-68`, `src/lib/components/DevicePalette.svelte:644-661`). #114 is closed.
- Effect of a 10 to 15 device data-centre pack:
  - Brand mode, the default browse: one more collapsed "NVIDIA" row, slotted A-Z by title.
  - Category and flat modes: the devices mix in, and Server gains 10U DGX entries.
  - Search: generic terms such as "server", "switch" or "400" can surface DGX and Spectrum rows. That is about 2 percent more rows against roughly 685 existing entries.
  - Filters: the "4U+" height bucket gains the DGX nodes.
  - Homelab users have no way to hide the pack.

## 10. Images

- Pipeline:
  - Sources are `assets-source/device-images/<vendor>/<slug>.<face>.png|jpg` (`docs/guides/NETBOX-IMPORT.md:135-139`).
  - `scripts/process-images.ts` resizes to a 400 px maximum width and writes WebP at quality 90 into `src/lib/assets/device-images/` (`scripts/process-images.ts:3-5`, `scripts/process-images.ts:90`, `scripts/process-images.ts:112-116`).
  - `scripts/generate-bundled-images.ts` scans that output and regenerates the auto-generated manifest of static Vite imports (`scripts/generate-bundled-images.ts:3-7`, `src/lib/data/bundledImages.ts:1-12`, `src/lib/data/bundledImages.ts:1055`).
  - Current vendor source folders are `_generic`, ac-infinity, apc, apple, arista, cisco, dell, eaton, fortinet, hpe, juniper, lenovo, mikrotik, netgear, palo-alto, qnap, supermicro, synology, tp-link and ubiquiti. There is no nvidia folder.
- Resolution and fallback:
  - `loadBundledImages` registers every bundled slug at start-up (`src/lib/stores/images.svelte.ts:118-140`), and lookups are by slug and face (`src/lib/stores/images.svelte.ts:109-116`).
  - `RackDevice` tries the placement's custom image first, then the device type's image by slug. If neither exists it renders the labelled colour body (`src/lib/components/RackDevice.svelte:196-209`). Only a missing placement image gets a placeholder (`src/lib/components/RackDevice.svelte:215-219`).
  - The `front_image` / `rear_image` flags are not consulted for rendering; they feed the "Has image" filter. With no image, a DGX device renders as a coloured labelled block.
  - Templates default to label display mode (`static/templates/home-lab.rackula.yaml:85-87`).
- Cost:
  - Brand packs and the image manifest are statically imported, not code-split (`src/lib/components/DevicePalette.svelte:38`, `src/lib/components/CommandPalette.svelte:43`, `src/lib/utils/device-lookup.ts:8`), so pack data counts toward the initial-JS budget.
  - That budget has a gzip baseline of 364,063 bytes with 30,000 bytes of headroom (`performance-budget.json:4`, `performance-budget.json:9`, `scripts/check-bundle-budget.ts:2-11`).
  - Image bytes are separate hashed assets.
- Licensing sources:
  - NetBox devicetype-library, CC0 (`ACKNOWLEDGEMENTS.md:11-17`, `docs/guides/NETBOX-IMPORT.md:280-286`, `src/lib/data/bundledImages.ts:10-11`).
  - vastoholic/draw-io device images, described as "freely shareable" (`ACKNOWLEDGEMENTS.md:31-35`).
  - There is no precedent for vendor product imagery under other terms.

## 11. Performance and loading

- Rendering: SVG throughout.
  - Each face of each rack is one `Rack` SVG containing a `RackDevice` component per top-level device (`src/lib/components/Rack.svelte:569-627`) and one `ConnectionLayer` (`src/lib/components/Rack.svelte:630-635`).
  - Every row item renders (`src/lib/components/RackCanvasView.svelte:638`).
  - A search for IntersectionObserver, cull, offscreen and virtualisation in `RackCanvasView`, `Rack`, `Canvas` and `RackDualView` returned nothing. There is no canvas virtualisation or culling.
- Baseline:
  - An empty 42U rack is about 384 SVG elements, 252 of them mounting holes, plus 7 to 15 per device (`docs/research/performance-baseline.md:13-15`, `docs/research/performance-baseline.md:79-101`).
  - The budget is 16 ms per frame, and virtualisation is listed only as future work (`docs/research/performance-baseline.md:177-185`).
  - By extrapolation (not measured), a 10-rack dual-view layout starts near 7,700 rack-frame elements before devices, ports or connections.
- Panzoom:
  - anvaka `panzoom` ^9.4.4 (`package.json:97`) applies a CSS transform to the canvas container (`src/lib/utils/panzoom-lifecycle.ts:81-84`, `src/lib/utils/panzoom-lifecycle.ts:129-134`, `src/lib/components/Canvas.svelte:313-314`, `src/lib/components/Canvas.svelte:522`).
  - Zoom is clamped to 0.25 to 2 (`src/lib/stores/canvas.svelte.ts:34-35`). Fit-all uses the same floor (`src/lib/utils/canvas.ts:95`, `src/lib/utils/canvas.ts:136-139`) and aligns top-left when content still overflows (`src/lib/utils/canvas.ts:156-168`), so a very wide POD row cannot be framed in one view.
- Known perf work:
  - The Svelte 5 hot-path audit is logged at `CHANGELOG.md:114`. It memoised Rack.svelte with a dropPreview guard, stopped the idle VerbBarOverlay poll, merged camera animation into a single tween and made the drag tooltip update in place (#2877, #2878; PRs #2880, #2881, #2888, #2889).
  - `Rack.svelte` indexes the device library by slug (`src/lib/components/Rack.svelte:195-197`).
  - #2874 to #2876 are not referenced by number in code or the changelog, only through their PRs.
- Budgets and scripts:
  - `performance-budget.json` and `scripts/check-bundle-budget.ts` gate the gzipped initial-load graph (`scripts/check-bundle-budget.ts:2-11`).
  - `scripts/performance-benchmark.ts` is a Node data generator with scenario tables and no browser automation (`scripts/performance-benchmark.ts:2-13`, `scripts/performance-benchmark.ts:145-174`).
  - `scripts/measure-startup-payload.ts` also exists.
- Playwright:
  - The config is `e2e/playwright.config.ts`. Its web server runs build plus preview on port 4173 (`e2e/playwright.config.ts:4-9`), with chromium and webkit desktop projects plus mobile projects (`e2e/playwright.config.ts:34-92`). Sibling configs cover a11y, dev, smoke and visual runs.
  - There is no perf or scale spec. The nearest is `e2e/multi-rack.spec.ts`, which asserts the 10-rack limit (`e2e/multi-rack.spec.ts:56-71`), plus `e2e/multi-rack-gapfill.spec.ts`.
- Ways to load an arbitrary layout into a running dev server:
  - File open (Ctrl+O):
    - `openFilePicker` accepts `.yaml` and `.zip` (`src/lib/utils/file.ts:8-19`), and the E2E helper drives the hidden input with `setInputFiles` (`e2e/helpers/toolbar-actions.ts:77-96`).
    - It runs full validation and is the only path that preserves ports, connections and full device types.
  - Share link `?l=`:
    - lz-string, with a legacy pako fallback (`src/lib/utils/share.ts:15`, `src/lib/utils/share.ts:20`, `src/lib/utils/share.ts:522-535`).
    - Limits are 64 KB encoded (`src/lib/utils/share.ts:461`) and 8 MB decompressed (`src/lib/utils/share.ts:468`). The source comment says a 100-rack, 4,200-device layout encodes to about 35 KB (`src/lib/utils/share.ts:456-459`).
    - The minimal format keeps racks, placements, rack groups and a reduced device type. It carries no interfaces, ports, connections, power, weight or airflow (`src/lib/schemas/share.ts:86-161`, `src/lib/schemas/share.ts:192-218`), and it rewrites rack width to 10 or 19 (`src/lib/utils/share.ts:54-56`, `src/lib/schemas/share.ts:158`).
    - Usable for rack-count tests, not fabric tests. E2E uses it via `/?l=` (`e2e/helpers/test-layouts.ts:3`, `e2e/helpers/test-layouts.ts:266`, `e2e/helpers/test-layouts.ts:282`).
  - localStorage injection:
    - Seed before load with `page.addInitScript` (pattern at `e2e/helpers/test-layouts.ts:263`, `e2e/helpers/visual.ts:35`).
    - Key `Rackula:workspace` holds {schemaVersion, activeId, openTabs, library: {<id>: LibraryEntry}} (`src/lib/storage/browser-workspace.ts:39`, `src/lib/storage/browser-workspace.ts:58-67`). An open tab with no library entry is filtered out (`src/lib/storage/browser-workspace.ts:154-160`).
    - Key `Rackula:layout:<id>` holds JSON {schemaVersion: 2, layout: <bare layout>, savedAt, writer tab id} (`src/lib/storage/browser-workspace.ts:44`, `src/lib/storage/browser-workspace.ts:273-278`).
    - `loadLayoutBody` rejects a body with no `layout` object (`src/lib/storage/browser-workspace.ts:212-215`), then runs migrateLayout, the version gate and `parseLayoutObject` (`src/lib/storage/browser-workspace.ts:220-247`).
    - `e2e/helpers/multi-context.ts:44-65` reads these keys back.
  - Test hook: none found. The only window global is the runtime config `window.__RACKULA_CONFIG__` (`src/lib/storage/availability.svelte.ts:62`, `src/lib/storage/availability.svelte.ts:75`).
  - Dev-only starter: drop a YAML in `static/templates/` and add it to `TEMPLATE_FILES` (`src/lib/templates/starter-templates.ts:41-45`), minding the position-units trap in section 4.

## 12. Depth

- Devices: `is_full_depth` boolean only (`src/lib/schemas/index.ts:460`, `src/lib/types/index.ts:468-469`). It drives the effective face, so full-depth devices show on both faces (`src/lib/components/Rack.svelte:262-273`), and it drives the rear treatment (`src/lib/components/RackDevice.svelte:171-173`).
- Racks: `depth_mm`, default 1000 (`src/lib/schemas/index.ts:642`, `src/lib/schemas/index.ts:680`, `src/lib/types/constants.ts:117-120`), with presets from 450 to 1200 (`src/lib/types/constants.ts:127-132`).
  - It is editable in the rack panel (`src/lib/components/EditPanelRack.svelte:104`, `src/lib/components/EditPanelRack.svelte:224-230`, `src/lib/components/EditPanelRack.svelte:376`).
  - It is informational only. The only readers are the edit panel and YAML field ordering, and no fit or collision check uses it.
- Not found in `src`: device `depth_mm`, rack `mounting_depth_mm`, `outer_depth_mm`.
- M021 state:
  - #2627 ("depth schema fields, null migration, and upgrade-corpus fixture") is open in M021, and epic #2635 is open.
  - The agreed but unbuilt design is in `docs/research/2622-patterns.md`:
    - optional device `depth_mm` (`docs/research/2622-patterns.md:23-26`)
    - `mounting_depth_mm` as the rail-to-rail collision datum, with `outer_depth_mm` for visuals (`docs/research/2622-patterns.md:32-38`)
    - fallback to categorical behaviour when depth is unknown (`docs/research/2622-patterns.md:163`)
  - `docs/research/2622-codebase.md:22` confirms there is no numeric depth.
- Result: a DGX-class chassis of about 900 mm can be marked full-depth, with its millimetre depth kept only in `notes`. Rackula cannot flag overhang against a rack's usable depth.

## Constraints and gaps summary

| Gap | Evidence (path:line) | Blocks which option |
| --- | --- | --- |
| No OSFP, QSFP112, 800G or InfiniBand interface types | `src/lib/schemas/index.ts:136-192` | brand pack (ports), pre-wired fabric |
| Strict `z.enum`: prior releases reject the whole layout on any new interface or category value, contrary to SCHEMA.md's MINOR rule | `src/lib/schemas/index.ts:317`, `src/lib/schemas/index.ts:401`, `src/lib/utils/yaml.ts:355-361`, `docs/reference/SCHEMA.md:56` | brand pack with new port types, pre-wired fabric, any template that uses them |
| Interface type declared twice (Zod enum and TS union), no compile-time link | `src/lib/types/index.ts:130-185`, `src/lib/schemas/index.ts:136-192` | brand pack with new port types (maintenance risk) |
| `SCHEMA_VERSION` MINOR unused, writers emit 1.0, gate is MAJOR-only | `src/lib/schemas/migrations.ts:21`, `src/lib/schemas/migrations.ts:50`, `src/lib/utils/yaml.ts:130` | any option that changes the schema (no graceful signal to old readers) |
| Schema change forces generate-schema plus a new corpus fixture | `src/tests/layout-json-schema.test.ts:33-44`, `scripts/check-corpus-freshness.sh:12-42` | brand pack with new port types, pre-wired fabric (process cost, not a blocker) |
| No NVIDIA pack, icon mapping or source images | `src/lib/data/brandPacks/index.ts:76-172`, `src/lib/components/BrandIcon.svelte:47-75` | brand pack (effort only; `siNvidia` exists) |
| No gpu, compute or accelerator category | `src/lib/schemas/index.ts:56-71` | brand pack (cosmetic; DGX maps to server) |
| Weight, airflow, `maximum_draw`, `va_rating` stored but never shown or summed | `src/lib/schemas/index.ts:331-338`, `src/lib/schemas/index.ts:462-464`, `src/lib/data/brandPacks/index.ts:288-301` | brand pack (spec value), single-rack starter, multi-rack POD template |
| No rack or group power budget, no power connections, no zero-U PDU | `src/lib/schemas/index.ts:655-706`, `src/lib/data/starterLibrary.ts:96-112` | single-rack starter (>25 kW story), multi-rack POD template |
| No device `depth_mm` or rack `mounting_depth_mm` (#2627 open) | `src/lib/schemas/index.ts:460`, `src/lib/schemas/index.ts:642`, `docs/research/2622-patterns.md:23-38` | brand pack (accuracy), single-rack starter |
| Script importer ignores interfaces, weight and power | `scripts/import-netbox-devices.ts:52-65`, `scripts/import-netbox-devices.ts:249-289` | brand pack (ports authored by hand) |
| In-app importer maps unknown interface types to `other` and infers network from any `*base*` interface | `src/lib/utils/netbox-import.ts:214`, `src/lib/utils/netbox-import.ts:363-377` | brand pack (import fidelity), pre-wired fabric |
| More than 24 ports per face: grouped badges, no anchors or click targets, connections skipped (#356 open) | `src/lib/utils/port-geometry.ts:33`, `src/lib/components/PortIndicators.svelte:316-336`, `src/lib/utils/connection-path.ts:562-591` | pre-wired fabric |
| Cross-rack connections not drawn (#272 open) | `src/lib/components/Rack.svelte:630-635`, `src/lib/components/ConnectionLayer.svelte:12-17` | pre-wired fabric, multi-rack POD template |
| Front-to-rear connections not drawn | `src/lib/utils/port-geometry.ts:105-114`, `src/lib/components/RackDualView.svelte:340-379` | pre-wired fabric |
| Container-child ports have no anchors (#3117 open) | `src/lib/components/RackDevice.svelte:852-878`, `src/lib/utils/connection-path.ts:485-495` | pre-wired fabric (only for gear in carriers) |
| `MAX_RACKS = 10` on add paths | `src/lib/types/constants.ts:90`, `src/lib/stores/layout/rack-actions.ts:595-596`, `e2e/multi-rack.spec.ts:56-71` | multi-rack POD template (SuperPOD scale; BasePOD fits) |
| One horizontal row, no 2D placement, no nested groups | `src/lib/components/RackCanvasView.svelte:600-607`, `src/lib/utils/rack-row.ts:11-20` | multi-rack POD template (SU, row and hall structure) |
| No group-level metadata; unknown group fields not written back | `src/lib/schemas/index.ts:697-706`, `docs/reference/SCHEMA.md:610` | multi-rack POD template |
| Templates must use internal-unit positions or rely on the U1 to U5 heuristic; failures are silent | `src/lib/schemas/migrations.ts:103-108`, `src/lib/templates/starter-templates.ts:115-118`, `static/templates/home-lab.rackula.yaml:22` | single-rack starter, multi-rack POD template |
| Templates must embed device types and explicit PlacedPort ids (no port instantiation on load) | `src/lib/components/Rack.svelte:583`, `src/lib/schemas/index.ts:550`, `src/lib/stores/layout/device-actions.ts:124` | pre-wired fabric, multi-rack POD template (authoring cost) |
| Starter palette entries hard-coded; flat, ungrouped starter menu | `src/lib/actions/registry.ts:490-515`, `src/lib/actions/dispatch.ts:201-206`, `src/lib/components/NewLayoutMenu.svelte:93-116` | single-rack starter, multi-rack POD template |
| All starters fetched on first menu open, no size cap | `src/lib/templates/starter-templates.ts:128-135` | multi-rack POD template (cost to homelab users) |
| Share links drop interfaces, ports, connections and 21/23-inch widths | `src/lib/schemas/share.ts:86-161`, `src/lib/utils/share.ts:54-56` | pre-wired fabric (sharing), multi-rack POD template (sharing) |
| No canvas culling; fit-all floor at 25 percent zoom | `src/lib/components/RackCanvasView.svelte:638`, `src/lib/utils/canvas.ts:95` | multi-rack POD template at SuperPOD scale |
| Every rack face iterates every connection; each add validates in O(ports + connections) | `src/lib/components/ConnectionLayer.svelte:68-74`, `src/lib/stores/connection.svelte.ts:50-118` | pre-wired fabric at scale |
| No pack hide or brand filter; search indexes every pack, including by category | `src/lib/components/DevicePalette.svelte:376-392`, `src/lib/utils/deviceFilters.ts:72-82` | brand pack (homelab noise, minor) |
| No Playwright perf or scale spec | `e2e/playwright.config.ts:34-92` | measurement for multi-rack POD template and pre-wired fabric |
