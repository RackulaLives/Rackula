# Settings Menu Checkbox Indicators Design

**Date:** 2026-01-15
**Status:** Approved
**Issue:** #677

## Problem

The settings menu checkbox items use a text checkmark (`✓`) when checked and nothing when unchecked, making the off-state invisible. Users cannot easily see which options are enabled vs disabled.

## Solution

Replace text checkmarks with filled/empty square SVG icons that clearly indicate on/off state.

| State     | Icon | Description          |
| --------- | ---- | -------------------- |
| Checked   | ■    | Filled square icon   |
| Unchecked | □    | Empty square outline |

### Layout

```text
[ ■ ] Show Annotations
[ □ ] Banana for Scale
```

The indicator sits left of the label (standard checkbox convention), making both states visually distinct.

## Implementation

### 1. New Constants File

Create `src/lib/constants/sizing.ts` to centralize icon sizing and eliminate magic numbers:

```ts
/**
 * Icon sizes matching CSS tokens in tokens.css
 * Use these instead of hardcoded pixel values
 */
export const ICON_SIZE = {
  sm: 16, // --icon-size-sm
  md: 20, // --icon-size-md
  lg: 24, // --icon-size-lg
  xl: 28, // --icon-size-xl
} as const;

export type IconSize = keyof typeof ICON_SIZE;
```

### 2. New Icon Components

Add to `src/lib/components/icons/`:

- **IconSquare.svelte** - Empty square outline (unchecked state)
- **IconSquareFilled.svelte** - Filled square (checked state)

Follow existing icon component pattern with `size` prop.

### 3. SettingsMenu Component Changes

Update `src/lib/components/SettingsMenu.svelte`:

```svelte
<script lang="ts">
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { IconSquare, IconSquareFilled } from "./icons";
  // ... existing imports
</script>

<!-- Replace existing checkbox snippet -->
<DropdownMenu.CheckboxItem class="menu-item" ...>
  {#snippet children({ checked })}
    <span class="menu-checkbox">
      {#if checked}
        <IconSquareFilled size={ICON_SIZE.sm} />
      {:else}
        <IconSquare size={ICON_SIZE.sm} />
      {/if}
    </span>
    <span class="menu-label">Show Annotations</span>
  {/snippet}
</DropdownMenu.CheckboxItem>
```

## Files Changed

- `src/lib/constants/sizing.ts` (new)
- `src/lib/components/icons/IconSquare.svelte` (new)
- `src/lib/components/icons/IconSquareFilled.svelte` (new)
- `src/lib/components/icons/index.ts` (export new icons)
- `src/lib/components/SettingsMenu.svelte` (update checkbox rendering)

## Future Considerations

The `ICON_SIZE` constants establish a pattern that can be adopted across the codebase to replace hardcoded pixel values in icon components. This is currently technical debt - icons throughout the app use `size={16}` etc.

**Tracking issue:** [#692 - Migrate hardcoded icon sizes to ICON_SIZE constants](https://github.com/RackulaLives/Rackula/issues/692)
