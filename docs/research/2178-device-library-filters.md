# Spike #2178: Attribute Filters for the Device Library

**Date:** 2026-06-12 **Milestone:** M07 -- Device Library & Image System **Status:** Complete

## Research Question

How should attribute-based filters work on the device library, in design and implementation, so a user can narrow the palette by numeric attributes (width, height) and boolean facets (has image, custom)?

## Executive Summary

The palette already has fuzzy text search (`searchDevices`) and one structured filter (rack-width compatibility). This spike adds a small, composable attribute-filter layer on top of the same derivation chain.

Key findings that shaped the design:

- **Width is binary, not numeric.** `slot_width` is `1` (half) or `2`/undefined (full), so width is a half/full facet rather than a `>=`/`<=` comparison.
- **Height (`u_height`) is the only true numeric field** (0.5-42U); most gear is 1-4U, so a small set of preset buckets fits user intent better than a free range or operators.
- **Images are boolean flags** (`front_image`, `rear_image`), so "has image" is a simple truthiness facet, not an image-presence lookup.
- **Custom detection already exists** as `isCustomDevice(slug)`.
- **Virtualization (#114) is not implemented yet.** Filters only shrink the result set, so there is no current interaction to design around; revisit when #114 lands.

Recommended model: a single pure predicate `filterDevicesByAttributes` in `deviceFilters.ts`, ANDed across filter groups and ORed within a group, surfaced through a filter button + popover with an active-count badge, with session-only state.

## Confirmed Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Height filter | Preset buckets (multi-select chips): 1/2U, 1U, 2U, 3U, 4U+ | Matches how homelabbers actually shop; mobile-friendly; cheapest to build |
| Width filter | Half-width / Full-width facet toggles | `slot_width` is binary, so a range comparison is meaningless |
| Image facet | Single "Has image" toggle (front OR rear) | Flags are boolean; granularity not needed for v1 |
| Custom facet | Single "Custom only" toggle (`isCustomDevice`) | Detection already exists; created-vs-imported split adds surface for no clear demand |
| UX surface | Filter button + popover with active-count badge | Most compact; scales to the 320px mobile drawer |
| Persistence | Session-only (`$state`, resets on reload) | Avoids the "why is my library empty?" trap; matches existing search behaviour |
| Composition | AND across groups, OR within a group; empty group = pass-through | Standard faceted-search semantics; empty filters return everything unchanged |

## Technical Findings (Codebase)

### Filtering and search chain

`src/lib/utils/deviceFilters.ts` exposes the relevant pure functions:

- `searchDevices(devices, query)` - Fuse.js fuzzy search (keys: model w3, manufacturer w2, slug w1, category w1; `threshold: 0.3`; multi-word AND).
- `filterDevicesByRackWidth(devices, rackWidth)` and the palette-aware `filterPaletteDevicesByRackWidth(devices, rackWidth, compatibleOnly)` (returns all devices when `compatibleOnly` is false).
- `groupDevicesByCategory`, plus the brand/category/flat sort helpers.

`DevicePalette.svelte` wires these as `$derived` steps: `allPaletteDevices -> filterPaletteDevicesByRackWidth -> searchDevices -> grouping`, applied separately to generic devices, each brand pack, and the flat list.

### Device type fields (`src/lib/types/index.ts`)

- `u_height: number` (required, 0.5-42).
- `slot_width?: SlotWidth` (`1 | 2`; default/undefined = full-width = 2).
- `front_image?: boolean`, `rear_image?: boolean` (flags only).

### Custom detection (`src/lib/utils/device-lookup.ts`)

`isCustomDevice(slug)` returns true when the slug is in neither the starter library nor any brand pack. Custom types live in the layout's `device_types`.

### Reusable UI and persistence patterns

- bits-ui re-export wrappers in `src/lib/components/ui/` (Accordion, Dialog, Tabs, ContextMenu). **No Popover wrapper exists yet** - add one following the same pattern.
- `Checkbox.svelte` and `Switch.svelte` custom wrappers; `SegmentedControl.svelte` is single-select (not reusable for multi-select height chips).
- Persistence precedent: `deviceGrouping.ts` (`Rackula-device-grouping`) and the `compatibleOnly` flag (`Rackula-device-compatible-only`) via `safe-storage.ts`. Used here only as a style reference - filters are intentionally session-only.

## Filter Model (Design)

```ts
export type HeightBucket = "0.5" | "1" | "2" | "3" | "4plus";

export interface DeviceAttributeFilters {
  heights: Set<HeightBucket>;
  halfWidth: boolean;
  fullWidth: boolean;
  hasImage: boolean;
  customOnly: boolean;
}

export function filterDevicesByAttributes(
  devices: DeviceType[],
  filters: DeviceAttributeFilters,
  isCustom: (slug: string) => boolean, // injected to keep the function pure and testable
): DeviceType[];
```

Bucket predicates (OR within the height group):

- `0.5`: `u_height < 1`
- `1` / `2` / `3`: `u_height === N`
- `4plus`: `u_height >= 4`

Width (OR within the width group): half = `slot_width === 1`; full = `slot_width === 2 || slot_width == null`. Both checked or both unchecked = no width filter.

Facets: has-image = `Boolean(front_image || rear_image)`; custom = `isCustom(slug)`.

Across groups: AND. A group with no active selection is skipped, so the default empty-filters object returns every device unchanged.

## Composition in the Palette

Insert attribute filtering between the rack-width filter and text search so Fuse ranks the already-narrowed set:

```
allPaletteDevices
  -> filterPaletteDevicesByRackWidth(..., compatibleOnly)
  -> filterDevicesByAttributes(..., filters, isCustomDevice)
  -> searchDevices(..., query)
  -> groupDevicesByCategory / grouping mode
```

Added as new `$derived` steps in `DevicePalette.svelte`, mirroring the existing `visibleGenericDevices -> filteredGenericDevices` chain, and applied identically to the brand-pack and flat/category derivations.

## UX Approach

- **Filter button** in the existing `search-row` next to the create-device button: a funnel icon with a small badge showing the number of active filter groups.
- **Popover** (form-style) containing the height chip group, half/full-width toggles, "Has image", "Custom only", and a "Clear filters" action.
- **Components**: add a thin `src/lib/components/ui/Popover/` bits-ui re-export following the Accordion/Dialog/Tabs pattern; reuse `Checkbox.svelte` for the four toggles; build a small multi-select chip group for height. Validate new components with the Svelte MCP `svelte-autofixer`.
- **Empty state**: extend the existing "No devices match your search" copy to also acknowledge active filters.
- **Mobile**: the popover anchors to the button and fits the 320px drawer; no separate mobile layout needed for v1.

## Persistence and Virtualization

- **Persistence**: session-only. Filters live in `$state` in `DevicePalette.svelte` and reset on reload, matching the existing search query. No localStorage key is added.
- **Virtualization (#114)**: not implemented today. Attribute filters only reduce the rendered set, so they are complementary and require no special handling now. When #114 lands, the filtered list feeds the virtualizer unchanged.

## Followup Implementation Issues

1. **feat: device attribute filter model and predicate** (`size:small`, `area:devices`)
   - Add `DeviceAttributeFilters` / `HeightBucket` and `filterDevicesByAttributes` to `deviceFilters.ts`.
   - Behavioural unit tests: bucket boundaries (0.5 / 1 / 4+), width OR, has-image, custom-only, AND-across-groups, empty-filters pass-through. Use `createTestDeviceType` and a fake `isCustom`; follow the `rack-width-filter.test.ts` style (no exact-length assertions on data arrays).

2. **feat: device filter popover UI in the palette** (`size:medium`, `area:ui`, `area:devices`)
   - Add the `ui/Popover` wrapper and `DeviceFilterPopover.svelte` (height chips, width/image/custom toggles, clear action).
   - Add the filter button + active-count badge to `DevicePalette.svelte`; hold the filter object in session `$state`.
   - Wire `filterDevicesByAttributes` into the generic/brand/flat derivation chains and update the empty-state copy.

The `ui/Popover` wrapper is small enough to live inside issue 2 rather than its own issue.

## Related

- Existing search: #310 (Fuse.js fuzzy search), #308 (multi-field relevance)
- Virtualization: #114 (not yet implemented)
- Half-width / `slot_width` model: #159
