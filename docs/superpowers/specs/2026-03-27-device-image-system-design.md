# Device Image System: Discoverability & Coverage

**Date:** 2026-03-27 **Issue:** #1517 (Pictures of assets) **Status:** Design approved

## Problem

A user reported not seeing "pictures" of equipment when placing devices. Investigation revealed this isn't a bug — it's a gap between expectations and reality:

- The README promises "real device images so it actually looks like your gear, not sad grey boxes"
- Only 28% of devices (179 of 634) across 24 brands have bundled product images
- The default display mode is "label" (coloured blocks with text), not images
- The UI doesn't surface image availability, the display mode toggle, or the upload capability clearly
- No user-facing documentation explains the image system
- Custom device types have no bundled images and no guidance on uploading

## Approach

Phased rollout — each phase ships standalone value. Parent tracking issue with sub-issues per phase. #1517 becomes a child of the Phase 1 issue.

A separate feature issue will be created for an auto-generated image coverage table.

## Decisions

- Default display mode stays `label` — consistency over partial photos
- ImageIndicator shows image presence only, no "absent" state for devices without images
- No analytics instrumentation — gap scores and community feedback guide priorities
- No community contribution pipeline — too much overhead
- Coverage table is a separate auto-generated feature, not manual docs

---

## Phase 1: Honesty & Docs

**Scope:** No code changes. Documentation and messaging only.

### README Fix

Before:

> "Real device images so it actually looks like your gear, not sad grey boxes"

After:

> "Product images for popular brands (Ubiquiti, HPE, Arista, and more) — upload your own for any device"

### User-Facing Docs Page

Create a user-facing guide (location TBD — likely `docs/guides/` or in-app help) covering:

- Which brands have bundled images and approximate coverage
- How to use the display mode toggle (`I` key cycles label → image → image-label)
- How to upload custom images (select device → EditPanel → Choose File)
- Starter library: 11 generic devices all include images out of the box
- Custom device types: no bundled images, but upload works the same way

### Reply to #1517

Link the reporter to the new docs page with specific guidance on the display mode toggle and image upload.

### Success Criteria

Reporter's question is answered. New users landing on README have accurate expectations about image availability.

---

## Phase 2: UI Discoverability

**Scope:** Make existing features findable. Default display mode stays "label".

### Changes

- Surface display mode toggle in toolbar (not just `I` key)
- Improve ImageIndicator — clearer icon for devices that have images (presence only)
- Better EditPanel image upload section (less jargon, clearer affordance)
- Help panel explains the image system, not just the keyboard shortcut
- Account for custom device types in all UI changes (they behave like brand devices without bundled images)

### Success Criteria

A new user can discover and activate image mode without reading docs or knowing keyboard shortcuts.

---

## Phase 3: Coverage Expansion

**Scope:** Targeted by impact. Audit upstream first, then fill gaps.

### Approach

1. Audit NetBox Device Type Library for images available upstream that haven't been imported into Rackula
2. Import available images for priority brands

### Priority Brands by Gap Score

Gap Score = total devices x (1 - coverage%). Higher = more impact from adding images.

| Brand      | Devices | Current Coverage | Gap Score |
| ---------- | ------- | ---------------- | --------- |
| Dell       | 74      | 8%               | 68        |
| MikroTik   | 61      | 3%               | 59        |
| Ubiquiti   | 111     | 49%              | 56        |
| APC        | 60      | 16%              | 50        |
| Synology   | 33      | 0%               | 33        |
| TP-Link    | 29      | 0%               | 29        |
| Supermicro | 22      | 13%              | 19        |
| Netgear    | 19      | 5%               | 18        |
| QNAP       | 13      | 0%               | 13        |

### Success Criteria

Overall image coverage increases from 28% to >=50%.

---

## Phase 4: Upload UX

**Scope:** Let users fill the gaps themselves.

### Changes

- Streamline image upload (drag-drop in palette, not buried in EditPanel)
- Image sharing via layout exports (needs architectural design — bundled images are static Vite assets referenced by URL, user-uploaded images are in-memory blobs/dataUrls; export format needs to handle both)

### Success Criteria

A user can upload a custom device image in 3 or fewer clicks from the palette.

---

## Current Coverage Snapshot

As of 2026-03-27. 634 total devices across 24 brands.

### Full Coverage (100%)

Arista (8), Juniper (8), AC Infinity (3), Apple (2)

### Partial Coverage

Ubiquiti 49% (55/111), HPE 37% (21/56), Palo Alto 34% (8/23), Fortinet 31% (9/29), Eaton 25% (7/27), Cisco 21% (8/38)

### Low Coverage (<15%)

APC 16% (10/60), Supermicro 13% (3/22), Lenovo 9% (1/11), Dell 8% (6/74), Netgear 5% (1/19), MikroTik 3% (2/61)

### Zero Coverage

Synology (33), TP-Link (29), QNAP (13), CyberPower (10), Netgate (8), DeskPi (8), Blackmagic Design (7), Vertiv (1)

### Starter Library

11 generic devices (1u-server, 2u-server, 4u-server, 24-port-switch, 48-port-switch, 1u-router-firewall, 1u-storage, 2u-storage, 4u-storage, 2u-ups, 1u-console-drawer) all have bundled images.

---

## Key Files

| File | Purpose |
| --- | --- |
| `src/lib/stores/ui.svelte.ts` | Display mode state (default: "label") |
| `src/lib/components/RackDevice.svelte` | Device rendering (label/image/image-label) |
| `src/lib/components/ImageIndicator.svelte` | Camera icon showing image availability |
| `src/lib/components/ImageUpload.svelte` | Image upload in EditPanel |
| `src/lib/stores/images.svelte.ts` | Image store (bundled + user-uploaded) |
| `src/lib/data/bundledImages.ts` | Auto-generated manifest of bundled WebP images |
| `src/lib/data/brandPacks/` | Brand pack device definitions with image flags |
| `src/lib/components/DragTooltip.svelte` | Drag feedback (text label, not image preview) |
