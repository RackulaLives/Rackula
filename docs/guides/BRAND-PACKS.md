# Brand Pack Contribution Guide

A brand pack is one vendor section in Rackula's device library (Dell, Ubiquiti, Blackmagic Design, and so on). This guide walks through adding a new vendor and opening a PR.

> Adding a device to a vendor that already exists? You do not need this guide. Open the matching file in `src/lib/data/brandPacks/`, add the device to its array, and see [NETBOX-IMPORT.md](NETBOX-IMPORT.md) for sourcing the data and images. The steps below are for creating a brand-new vendor section.

This guide owns the mechanics of a new pack: the data file, registration, and the brand icon. Two neighbouring docs own the rest and are linked where they apply:

- [NETBOX-IMPORT.md](NETBOX-IMPORT.md): sourcing device data, slug and category conventions, and the device-image pipeline.
- [CONTRIBUTING.md](../../CONTRIBUTING.md): dev setup, formatting, and the PR and sign-off process.

## What we accept

Homelab, AV and broadcast, networking, power, storage, cooling, and enterprise gear are all welcome. There is no gate on the kind of hardware; the bar is accuracy:

- Real, rack-mountable products (any rack width Rackula supports: 10, 19, 21, 23 inch).
- Correct `u_height` and depth, taken from a spec sheet or measured.
- The right `category` and a unique `slug` per device.
- A brand icon (see Step 3).
- A verifiable source. Manufacturer spec sheets are ideal. The [NetBox devicetype-library](https://github.com/netbox-community/devicetype-library) is a convenient CC0 source with dimensions and elevation images.

## Step 1: Create the pack file

Add `src/lib/data/brandPacks/<brand>.ts` exporting a `<brand>Devices` array. A real minimal pack to copy is [`zima.ts`](../../src/lib/data/brandPacks/zima.ts) (one device); [`netgate.ts`](../../src/lib/data/brandPacks/netgate.ts) shows several.

```typescript
import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Acme device definitions
 */
export const acmeDevices: DeviceType[] = [
  {
    slug: "acme-sw24", // unique, lowercase, hyphenated
    u_height: 1, // 0.5 to 50, in steps of 0.5
    manufacturer: "Acme",
    model: "SW24",
    category: "network",
    colour: CATEGORY_COLOURS.network,
    is_full_depth: false,
    airflow: "front-to-rear",
  },
];
```

Required on every device: `slug`, `u_height`, `category`, and `colour`. Everything else is optional. The full field list and its rules live in the Zod schema at [`src/lib/schemas/index.ts`](../../src/lib/schemas/index.ts) (`DeviceTypeSchema`), which validates every device at load and in tests.

Field notes:

- `slug`: lowercase letters, digits, and single hyphens, unique across all packs. Convention is `<manufacturer>-<product-line>-<model>` (a `+` becomes `-plus`). See the slug rules in [NETBOX-IMPORT.md](NETBOX-IMPORT.md#slug-naming-convention).
- `category`: one of `server`, `network`, `firewall`, `patch-panel`, `power`, `storage`, `kvm`, `av-media`, `cooling`, `shelf`, `blank`, `cable-management`, `chassis`, `other`. Categories drive the default colour and behaviour.
- `colour`: any 6-character hex, but use `CATEGORY_COLOURS.<category>` from [`src/lib/types/constants.ts`](../../src/lib/types/constants.ts) so packs stay consistent with the palette.
- `airflow` (optional): `passive`, `front-to-rear`, `rear-to-front`, `left-to-right`, `right-to-left`, `side-to-rear`, or `mixed`. Defaults to `front-to-rear`.
- `slot_width: 1` marks a half-width device; `u_height` below 1 marks sub-U gear. Both mount inside a carrier rather than directly on the rails, which Rackula handles at placement time.
- `front_image` / `rear_image` (optional booleans): set these only after you have run the image pipeline in [NETBOX-IMPORT.md](NETBOX-IMPORT.md); images are optional and can come in a later PR.

## Step 2: Register the pack

Open [`src/lib/data/brandPacks/index.ts`](../../src/lib/data/brandPacks/index.ts) and make two edits: import the array, then add one entry to `BRAND_PACK_REGISTRY`.

```typescript
// 1. Import (with the other brand imports near the top)
import { acmeDevices } from "./acme";

// 2. One registry entry
const BRAND_PACK_REGISTRY: ReadonlyArray<
  Omit<BrandSection, "defaultExpanded">
> = [
  // ... existing packs
  { id: "acme", title: "Acme", devices: acmeDevices, icon: "acme" },
];
```

That is the whole registration. The palette sections, the merged device list, slug lookups, and the tests all derive from `BRAND_PACK_REGISTRY`, so there is nothing else to keep in sync in this file. Order in the array does not matter: sections render A-Z by `title` and devices sort A-Z within each section.

- `id`: unique, matches your file name. It keys the palette accordion, so a duplicate breaks the library (a test enforces uniqueness).
- `title`: the display name shown in the library.
- `icon`: the brand-icon slug, wired up in Step 3.

## Step 3: Add the brand icon

The `icon` slug in your registry entry is looked up in an `iconMap` in [`src/lib/components/BrandIcon.svelte`](../../src/lib/components/BrandIcon.svelte). This is the one step the registry does not do for you. If the slug has no iconMap entry, the section renders a generic lightning-bolt fallback.

First check whether the brand is in [simple-icons](https://simpleicons.org): search the site for the brand.

If it is there, import its `si<PascalName>` export and map your slug to it:

```svelte
import { siAcme } from "simple-icons";

const iconMap = {
  // ... existing entries
  acme: siAcme,
};
```

If it is not in simple-icons, add a path to [`src/lib/components/customBrandIcons.ts`](../../src/lib/components/customBrandIcons.ts) (an SVG path normalised to a 24x24 viewBox) and map your slug to it with a hex colour:

```typescript
// customBrandIcons.ts
export const acmePath = "M12 2L2 22h20L12 2z";
```

```svelte
// BrandIcon.svelte
import { acmePath } from "./customBrandIcons";

const iconMap = {
  // ... existing entries
  acme: { path: acmePath, hex: "FFFFFF" },
};
```

The iconMap key must match the `icon` value in your registry entry exactly. If you see a lightning bolt where your logo should be, they do not match.

## Step 4: Verify and open a PR

Run the checks locally:

```bash
npm run check       # types
npm run lint        # ESLint
npm run format      # Prettier (run this; a new .ts file often needs it)
npm run test:run    # unit tests
npm run build       # production build
npm run dev         # then find your brand in the library and confirm the icon
```

You do not edit any test file. `src/tests/brandpacks.test.ts` is parameterised over the registry and validates every device against the schema, so a correct pack passes with zero test changes. Adding a device must never require touching a test.

Then open the PR following [CONTRIBUTING.md](../../CONTRIBUTING.md#pull-request-process): branch `feat/<brand>-brand-pack`, a `feat:` commit signed off with `git commit -s` (DCO), and AI co-author attribution if you used assistance. CodeRabbit reviews every PR, so expect review comments before merge.

## Checklist

- [ ] New `src/lib/data/brandPacks/<brand>.ts` exporting `<brand>Devices`.
- [ ] Each device has `slug`, `u_height`, `category`, `colour`; slugs unique.
- [ ] Imported and added one `BRAND_PACK_REGISTRY` entry in `index.ts`.
- [ ] Brand icon wired in `BrandIcon.svelte` (simple-icons or `customBrandIcons.ts`).
- [ ] `npm run check`, `lint`, `format`, `test:run`, `build` all pass.
- [ ] `npm run dev` shows the section with the correct icon.
- [ ] PR branch, `feat:` commit, and DCO sign-off per CONTRIBUTING.md.
