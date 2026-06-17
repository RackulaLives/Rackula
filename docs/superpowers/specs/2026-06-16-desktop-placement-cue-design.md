# Desktop placement cue and click-to-place (#2352)

## Problem

The command palette "Add device..." sub-mode (#2214) and the mobile tap-to-place
workflow both call `placementStore.startPlacement()`, which sets `isPlacing = true`.
On mobile this arms a visible placement experience: a pink rack outline, pulsing
valid-slot highlights, a "Tap to place: X" header with a cancel button, and
tap-on-rack to place.

On desktop none of that surfaces. Choosing a device from the palette closes the
palette and arms placement, but the user sees no cue and there is no click-to-place,
so the armed state is invisible. The palette comment even admits the design
assumption: "The palette closing is the cue to position the device on the canvas."
That assumption holds on mobile (the sheet slides away to reveal the armed rack) but
not on desktop.

This is an accelerator gap, not a regression: the canonical desktop placement path
remains the Devices sidebar drag-and-drop.

## Root cause

The entire placement experience is gated by a single derived in `Rack.svelte`:

```ts
const isPlacementMode = $derived(
  viewportStore.isMobile && placementStore.isPlacing,
);
```

`isPlacementMode` drives the pink container outline, the valid-slot highlighting
(`RackFrame` `validPlacementSlots`), and the `RackPlacementHeader` overlay. A second
gate on the same condition guards the click-to-place handler in `handleClick`.

The `isMobile` conjunct predates the palette. It came from the original mobile-only
tap-to-place workflow (#1397/#1462). The underlying click and completion machinery is
already device-agnostic:

- `handlePlacementClick` (rack-interaction-handlers.ts) was written for "any pointing
  device, in any browser" (#1757) precisely because desktop browsers do not synthesise
  TouchEvents for a mouse.
- `handlePlacementTap` -> `placeDeviceSmart` (RackCanvasView.svelte) is device-agnostic
  completion.

So desktop placement is roughly 90% built. The only things keeping it mobile-only are
the two `isMobile` conjuncts.

## Options considered

- A. Un-gate the existing placement cue and click-to-place so they arm on desktop too.
- B. Have the palette "Add device" path select the device in the sidebar or start a
  desktop drag affordance instead of tap-to-place.
- C. Scope the palette "Add device" sub-mode to mobile only.

C removes value on the platform where Ctrl/Cmd+K matters most and contradicts #2214's
intent. B cannot programmatically start HTML5 drag-and-drop from a keyboard-driven
selection (DnD needs a real pointer gesture), and "select in sidebar" leaves the user
mid-task with no placement, a half-built interaction.

A is the smallest correct change because it reuses the already-built, already-tested,
device-agnostic placement pipeline. It is consistent with the canonical desktop path:
click-to-place is an accelerator that sits alongside sidebar drag-and-drop, not a
replacement. This is un-gating a complete interaction, not building one from scratch.

## Decision: Option A

### Changes

1. `Rack.svelte` — `isPlacementMode` becomes `$derived(placementStore.isPlacing)`.
   This arms the pink outline, valid-slot pulse, and placement header on desktop.

2. `Rack.svelte` `handleClick` — the placement branch guard becomes
   `if (placementStore.isPlacing)` (drop the `isMobile` conjunct). The
   `handlePlacementClick` path it calls is already device-agnostic. The existing
   pan/drag debounce guards above it still prevent accidental placement after a pan.

3. `Rack.svelte` `ontouchend` — stays gated on `viewportStore.isMobile`. It is the
   only genuinely touch-specific handler; desktop pointer placement goes through
   `handleClick`. Leaving it mobile-only avoids double-firing on touch (its
   `preventDefault` suppresses the synthesised click) and keeps touch behaviour
   unchanged.

4. `RackPlacementHeader.svelte` — the copy "Tap to place: X" reads wrong for a mouse.
   Add an `actionVerb` (or pass the full label) so desktop reads "Click to place: X"
   and mobile keeps "Tap to place: X". Derive the verb in `Rack.svelte` from
   `viewportStore.isMobile`.

5. `RackCanvasView.svelte` `handleDeviceDrop` — when a native drag-and-drop
   completes while placement is armed, cancel the armed placement. A completed
   drop is an unambiguous choice of the DnD path; without this the desktop
   click-to-place stays armed and the next rack click would silently place the
   still-pending palette device. This footgun is only reachable now that desktop
   click-to-place exists, so the guard ships with this change.

No change to the completion path, the store, or the palette.

### Cancel / escape

The placement header's cancel button already calls `handleCancelPlacement`, which
resets the store and refits the view. That works on desktop unchanged. Escape-to-cancel
also already exists and is viewport-agnostic: `handleEscape` in `dispatch.ts` cancels
placement when `isPlacing` is true. Both affordances are now reachable on desktop.

### Multi-rack note

On desktop multiple racks are visible at once. Each `Rack` instance independently
derives its own `validPlacementSlots` and renders its own header, so arming placement
highlights valid slots in every rack and a click in any rack places there (via
`placeDeviceSmart` on that rack's id). No active-rack coupling is needed.

## Testing

The device-agnostic units are already covered:

- `placement-pointer.test.ts` covers `handlePlacementClick` (valid places once, invalid
  signals error). This is exactly the desktop path; no `isMobile` branch lives in that
  function, so the existing test already proves desktop click-to-place at the unit
  level.

The only new behaviour is the gate change in `Rack.svelte`, which is a one-line derived
and a one-line conditional. Per project policy we do not add render/DOM-structure tests
for a Svelte component, and the placement algorithm itself is unchanged. No new unit
test is warranted; the change is a removal of a viewport conjunct over already-tested
machinery. Manual verification: on desktop, palette "Add device" then click a valid slot
places the device and shows the header/highlight while armed.

## Out of scope

- The orphaned `PlacementIndicator.svelte` (not rendered anywhere) is untouched.
- Cursor affordance changes (e.g. crosshair cursor) are not required; the header plus
  slot highlighting are the cue.
- Escape-to-cancel keybinding (cancel button is sufficient).
