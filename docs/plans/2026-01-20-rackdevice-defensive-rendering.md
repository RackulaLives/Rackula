# RackDevice Defensive Rendering Design

**Date:** 2026-01-20
**Status:** Approved
**Related:** #833 (half-width UI), #764 (drop mechanics)

## Problem

RackDevice.svelte calculates device width purely from the `slotPosition` prop (from `PlacedDevice.slot_position`) without validating against the device type's `slot_width` property.

**Risk scenarios:**

- A full-width device (`slot_width: 2`) with corrupted placement data (`slot_position: "left"`) would incorrectly render as half-width
- File imports with manually edited or corrupted data could cause visual misrepresentation
- Future features (like editing device width) could introduce mismatches if not handled carefully

**Principle:** The device type defines what a device IS (its physical characteristics). The placement defines WHERE it goes. Rendering should trust the device type as the source of truth.

## Background: slot_width Origin

`slot_width` is a **Rackula-specific property** - NetBox does not have native half-width device support. NetBox users work around this with parent devices and device bays.

**Physical meaning:**
| Value | Meaning | Physical Width |
|-------|---------|----------------|
| `2` (default) | Full-width | ~17.75" (entire interior) |
| `1` | Half-width | ~8.875" (half of interior) |

## Solution

Add defensive check in RackDevice.svelte: derive `effectiveSlotPosition` by combining device type's `slot_width` with placement's `slot_position`. Full-width devices always render full-width regardless of placement data.

### Current Code (lines 206-210)

```typescript
const deviceWidth = $derived(
  slotPosition === "full" ? fullWidth : fullWidth / 2,
);
const slotXOffset = $derived(slotPosition === "right" ? fullWidth / 2 : 0);
```

### Proposed Change

```typescript
// Device type determines if half-width rendering is allowed
const isDeviceTypeHalfWidth = $derived(device.slot_width === 1);

// Effective slot position: trust device type over placement data
// Full-width devices always render full, regardless of slot_position
const effectiveSlotPosition = $derived(
  isDeviceTypeHalfWidth ? slotPosition : "full",
);

// Width and position now use the validated effective position
const deviceWidth = $derived(
  effectiveSlotPosition === "full" ? fullWidth : fullWidth / 2,
);
const slotXOffset = $derived(
  effectiveSlotPosition === "right" ? fullWidth / 2 : 0,
);
```

## Edge Cases

| Scenario                                                | Current Behavior         | New Behavior           |
| ------------------------------------------------------- | ------------------------ | ---------------------- |
| Full-width device, `slot_position: "full"`              | Full-width               | Full-width             |
| Full-width device, `slot_position: "left"` (corrupted)  | Half-width (bug)         | Full-width             |
| Full-width device, `slot_position: "right"` (corrupted) | Half-width (bug)         | Full-width             |
| Half-width device, `slot_position: "left"`              | Half-width, left         | Half-width, left       |
| Half-width device, `slot_position: "right"`             | Half-width, right        | Half-width, right      |
| Half-width device, `slot_position: "full"` (corrupted)  | Full-width               | Full-width (fail-safe) |
| `slot_width: undefined` (legacy/default)                | Depends on slot_position | Full-width (default)   |

**Fail-safe behavior:** If data is inconsistent, render as full-width. This is conservative and harmless.

## Testing

Per CLAUDE.md testing rules, this is simple derived logic in a visual component. Skip unit tests:

- Logic is 3 lines of derived state
- Type-safe
- Easily verified visually
- Would require complex SVG rendering tests violating "no DOM queries" rule

## Files Affected

| File                                   | Change                                                              |
| -------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/components/RackDevice.svelte` | Add `isDeviceTypeHalfWidth`, `effectiveSlotPosition` derived values |

## Follow-up Issues

- User-facing documentation for `slot_width` concept (schema docs + UX help text)
