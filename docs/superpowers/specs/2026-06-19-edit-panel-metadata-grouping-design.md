# Edit-panel metadata regrouping (B1 spike)

Status: Decided
Date: 2026-06-19
Spike: #2441
Implements via: #2442 (editable vs read-only treatment), #2443 (collapsible device-type block)
Component: `src/lib/components/EditPanelMetadata.svelte`

## Problem

`EditPanelMetadata.svelte` interleaves editable controls and read-only reference facts in a scrambled order: Name (editable), then Device Type and Brand (read-only), then Height and Category (read-only), then Colour (editable but styled like a read-only row), then Mounted Face (editable), then power ratings and device-type notes (read-only), then IP and placement Notes (editable). A user cannot tell at a glance which values they can change. The Colour row is the sharpest example: it is editable but renders as a plain read-only `info-row`, so its affordance is invisible.

## Decision

Regroup the panel by meaning, consolidate all read-only facts into one muted, collapsible group, and give editable fields real form-control affordances so they are visually distinct from the facts.

### Section order

Within `EditPanelMetadata`, top to bottom:

1. Identity: Name (text input), Colour (swatch button)
2. Device type details: read-only facts, muted, collapsible. Type, Brand, Height, Category, power ratings, device-type notes.
3. Placement: Mounted Face (select)
4. Network: IP / Hostname (text input)
5. Notes: placement notes (textarea)

Whole-U Position remains in its sibling `EditPanelPosition` section and Images in `EditPanelImage`; this spike reorders within `EditPanelMetadata` only and does not change the host router's ordering of the sibling sections.

### Editable vs read-only treatment (#2442)

Editable fields render as real form controls: bordered input and select, and a swatch button for Colour, each with hover and focus states. Read-only facts render as borderless muted text and exist only under the Device type details header. The Colour row moves out of the read-only-looking `info-row` into the Identity group as a clear interactive swatch button, consistent with Name, Mounted Face, and IP.

### Collapsible device-type block (#2443)

The Device type details header carries a toggle. The block defaults to expanded. The collapsed state persists across device selections as a single UI flag, not per device. The count of hidden facts shows in the header when collapsed.

## Accessibility

The collapse toggle is a real `<button>` with `aria-expanded` reflecting the open state. Editable controls keep their visible labels and `for`/`id` associations. Read-only facts stay plain text and are not focusable form controls, so screen-reader users are not led to believe the facts are editable.

## Out of scope

Reordering or restyling the sibling sections (`EditPanelPosition`, `EditPanelImage`, `EditPanelActions`), the rack edit panel (`EditPanelRack`), and any change to what data is editable. This spike settles grouping, ordering, and affordance only.
