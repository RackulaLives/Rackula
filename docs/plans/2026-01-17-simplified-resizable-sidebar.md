# Simplified Resizable Sidebar

**Date:** 2026-01-17
**Status:** Approved
**Issue:** #711 (supersedes collapse/expand approach)

## Problem

The sidebar collapse/expand functionality has cross-browser issues, particularly in Firefox where the edge handle doesn't receive click events due to paneforge's pointer capture. The complexity of managing collapse state, edge handles, and pointer events isn't justified by the UX benefit.

## Solution

Replace collapsible sidebar with a simple resizable sidebar that has fixed min/max bounds.

## Behavior

- **Resize bounds:** 290px minimum, 420px maximum (configurable via props)
- **At limits:** Hard stop, no snap-back or visual feedback
- **Persistence:** Width saved to localStorage, restored on reload
- **Default:** 320px for first-time users

## Props

```typescript
interface Props {
  sidePanelSizeMin?: number; // Default: 290
  sidePanelSizeMax?: number; // Default: 420
  sidePanelSizeDefault?: number; // Default: 320
}
```

## Implementation

### Files to modify

1. **`src/App.svelte`**
   - Add `sidePanelSizeMin`, `sidePanelSizeMax`, `sidePanelSizeDefault` props
   - Remove `collapsible`, `collapsedSize`, `onCollapse`, `onExpand` from Pane
   - Add `minSize` / `maxSize` to sidebar Pane (percentage-based)
   - Use `onResize` callback to persist width
   - Remove `SidebarEdgeHandle` usage
   - Remove `sidebarCollapsed` derived state
   - Remove `toggleSidebarCollapse`, `handleSidebarCollapse`, `handleSidebarExpand`
   - Remove conditional rendering based on collapse state

2. **`src/lib/stores/ui.svelte.ts`**
   - Remove: `sidebarCollapsed`, `collapseSidebar()`, `expandSidebar()`
   - Add: `sidebarWidth: number | null` (pixels, null = use default)
   - Add: `setSidebarWidth(width: number)` method

3. **`src/lib/components/SidebarEdgeHandle.svelte`**
   - Delete entirely

### Paneforge percentage conversion

Paneforge uses percentages for `minSize`/`maxSize`. We'll calculate dynamically:

```typescript
// Convert pixel bounds to percentages based on viewport
let minSizePercent = $derived((sidePanelSizeMin / viewportStore.width) * 100);
let maxSizePercent = $derived((sidePanelSizeMax / viewportStore.width) * 100);
```

## What gets removed

- `SidebarEdgeHandle.svelte` component
- `sidebarCollapsed` state and related methods
- `pointer-capture.ts` usage in resize handle
- All Firefox-specific workarounds
- Double-click to toggle collapse behavior

## Testing

- Resize sidebar to min/max bounds - should hard stop
- Resize and reload - width should persist
- First visit (clear localStorage) - should use 320px default
- Verify in Firefox, Safari, Chrome
