# Rack Width Filtering Edge Cases Design

**Date:** 2026-01-15
**Related Issue:** #333
**Status:** Proposed

## Problem Summary

The rack width compatibility feature (PR #656) has several edge cases that affect user experience:

1. **21" racks treated incorrectly** - Rack schema allows `width: 21` but device filtering only handles 10/19/23, causing all devices to be filtered out for 21" racks
2. **Devices disappear mysteriously** - When switching between racks of different widths, incompatible devices vanish from the palette with no explanation
3. **Imported devices can't specify rack width** - Custom devices imported via NetBox YAML default to 19"-only, making them invisible for 10" rack users

## Proposed Solutions

### Fix 1: Handle 21" Racks Properly

**Approach:** Treat rack width as "minimum device width needed." A 19" device fits in 19", 21", or 23" racks. A 10" device only fits in 10" racks.

```typescript
// New logic in isDeviceCompatibleWithRackWidth
function isDeviceCompatibleWithRackWidth(
  device: DeviceType,
  rackWidth: number, // Accept any rack width, not just RackWidth type
): boolean {
  const deviceWidths = device.rack_widths ?? [19]; // Default to 19"

  // Device is compatible if rack width >= any of the device's supported widths
  return deviceWidths.some((deviceWidth) => rackWidth >= deviceWidth);
}
```

This means:

- 10" device → only fits 10" rack
- 19" device → fits 19", 21", 23" racks
- Universal device `[10, 19]` → fits any rack

### Fix 2: Visual Incompatibility Indicator

**Approach:** Show all devices in the palette, but visually indicate incompatible ones.

**UI Design:**

- Incompatible devices appear with **reduced opacity (50%)** and a **subtle strikethrough** on the name
- **Tooltip on hover:** "Requires 19\" rack (current: 10\")"
- **Drag disabled** for incompatible devices (cursor shows "not-allowed")
- No separate toggle needed - always show all devices

**Implementation location:** `DevicePaletteItem.svelte`

- Pass `isCompatible: boolean` prop based on active rack width
- Apply conditional CSS classes for visual treatment
- Conditionally disable drag handlers

**Benefits:**

- Users understand _why_ devices aren't available
- Users can still see the full library to understand what exists
- Prevents accidental placement of incompatible devices

### Fix 3: NetBox Import Rack Width Selection

**Approach:** Add a rack width selector to the NetBox import dialog.

**UI Design:**

- Add a "Rack Width Compatibility" field after device details are parsed
- Segmented control with options: `10"` | `19"` | `23"` | `Universal`
- Default selection: `19"` (standard)
- `Universal` sets `rack_widths: [10, 19, 23]`

**Implementation location:** `ImportFromNetBoxDialog.svelte`

- Add state for selected rack width
- Apply to imported device before adding to library
- Show field only after YAML is successfully parsed

**Why not auto-detect?** NetBox YAML doesn't include rack width info, so user must specify.

## Implementation Summary

### Files to Modify

| File                                               | Changes                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/types/index.ts`                           | Keep `RackWidth = 10 \| 19 \| 23` (device widths), accept `number` in filter function |
| `src/lib/utils/deviceFilters.ts`                   | Update `isDeviceCompatibleWithRackWidth` to use `>=` comparison logic                 |
| `src/lib/components/DevicePalette.svelte`          | Remove filtering, pass compatibility flag to items                                    |
| `src/lib/components/DevicePaletteItem.svelte`      | Add `isCompatible` prop, visual treatment, disable drag                               |
| `src/lib/components/ImportFromNetBoxDialog.svelte` | Add rack width selector                                                               |

### Testing

- Unit tests for new compatibility logic (21" rack scenarios)
- Unit tests for "minimum width" behavior
- Manual testing of visual indicators and drag prevention

### Not Changing

- `RackWidth` type stays as `10 | 19 | 23` for device annotations
- Existing DeskPi annotations remain correct
- No changes to rack creation or editing

## Edge Cases Considered

| Edge Case                                  | Decision                                                        |
| ------------------------------------------ | --------------------------------------------------------------- |
| Rack width changed after devices placed    | Not possible - rack width is immutable after creation           |
| Imported layouts with incompatible devices | Acceptable - placed devices stay, palette filtering is separate |
| 21" racks                                  | Treat as compatible with 19" devices (minimum width concept)    |

## Open Questions

None - design is complete and validated.
