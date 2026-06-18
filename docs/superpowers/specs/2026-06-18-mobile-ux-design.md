# Mobile UX Design

Status: Draft for review
Date: 2026-06-18
Milestone: M12 -- Mobile & Touch UX
Supersedes: the prior `Epic: Mobile Phone Experience` (#1044, closed without a usable result)

## Context

The mobile web view is currently a desktop UI shrunk onto a small screen with no mobile-first interaction model. Observed problems: menus duplicated in three places, selection shows two menus at once, tap-to-place does nothing, move up and down do nothing, no visible zoom control, no layout switcher, rack editing is unreachable, and an empty-rack hint tells the user to "drag devices from the left menu" where there is no left menu. The result is not usable.

Two investigations grounded this design. A codebase audit found that mobile is half-wired rather than unbuilt: most of the missing behaviour exists in code but is broken, ungated, or hidden. Competitive research found that a phone-editable canvas is rare (Figma cannot edit on mobile at all, FigJam is iPad-only) and that the rack and DCIM domain (NetBox, dcTrack, RackTables, openDCIM) deliberately treats rack layout as a desktop drag surface with mobile as view plus minor edits. Both point the same way: make mobile a first-class reader, and earn editing carefully.

## Goals

- Make the mobile view genuinely usable as a reader first (tablet-first, phone usable as a responsive floor).
- Support moderate touch editing where the whole-U grid makes it cheap and low-risk.
- Consolidate the duplicated chrome into a single, coherent, registry-driven interface.
- Stay consistent with the desktop UX overhaul rather than forking from it.

## Non-goals (deferred to desktop)

- Full authoring on touch: creating and deleting racks, free drag-rearrange, multi-select, connection and cable editing.
- A separate phone-specific design. Phone is the same design degraded responsively.

## Decision: editing scope

Mobile ships at Tier B, view plus moderate tweaks. The whole-U grid is a structural advantage the freeform canvases lack: tap-to-place into discrete slots and nudge up and down buttons sidestep the hardest touch problem (drag precision, where a fast tap is misread as a drag). Moderate editing covers placing a device, selecting and nudging, flip, duplicate, rename, notes, delete, and rack property edits. Full authoring stays on desktop.

## Architecture principle: registry-driven

Mobile chrome is a touch presentation layer over the shared command and action registry that already powers the command palette (Ctrl+K, #2096) and the mode-aware app menu (`enabledWhen`, #2187). The app menu, the bottom-nav actions, and the selection inspector verbs all resolve from one source of truth. This structurally removes the duplicated menus, lets fixes land once (for example the move validation fix is made in the shared `move` action and inherited by desktop, palette, and mobile), and keeps mobile aligned with the desktop overhaul. Mobile already surfaces the palette via the search button, so the entry point exists.

## Information architecture

Hi-fi mockups (iPad portrait, real design tokens) are preserved in `assets/2026-06-18-mobile-ux/`. The interactive source is `mockup.html` (open with `?mode=view|edit|placement|viewopts|layouts`).

### Top bar

Three zones: a left group (logo opening the app menu, and a boxed search button opening the command palette), the current layout name centred as a plain label, and the storage status chip on the right. There is no View/Edit toggle and no layout-name dropdown. See `assets/2026-06-18-mobile-ux/mobile-view.png`.

### Bottom navigation

Four tabs in the thumb zone, each opening a bottom sheet: Layouts, Racks, Devices, View. This mirrors the desktop left-panel structure and gives each domain a reachable home.

### Canvas

A clean reading surface with no persistent furniture. Pinch to zoom, two-finger pan, double-tap to fit. Undo and redo sit in a bottom-left cluster (consistent with the desktop relocation of history controls). The storage chip sits top-right. Both clusters are rounded rectangles, not circles or pills.

### Selection inspector

Tapping a device raises one bottom sheet (no read-only versus editable mode split). It carries the device facts and the registry-driven verbs (nudge up, nudge down, flip, duplicate) plus editable fields and a quiet, de-emphasised Remove. The canvas verb bar is suppressed on mobile, so the user never sees two menus at once. See `assets/2026-06-18-mobile-ux/mobile-edit.png`.

### Placement

A device is armed from the Devices tab. The top bar is replaced by a Placing banner with a Cancel action, valid U-slots are highlighted, and canvas pan is paused so a place-tap cannot scroll the rack away. See `assets/2026-06-18-mobile-ux/mobile-placement.png`.

### View options sheet

Opened from the View tab. Holds Display mode (Labels, Images, Both), a Read-only lock ("Lock the layout for viewing", the presentation safety valve that replaces an explicit edit mode), and a Zoom control (large minus and plus around a centred value) with Fit to screen inline. All controls share one touch height. See `assets/2026-06-18-mobile-ux/mobile-viewopts.png`.

### Layouts sheet

Opened from the Layouts tab. Lists every layout with the current one marked, tap to switch, plus New layout. This is the single home for switching and managing layouts; the top-bar name is only a label. See `assets/2026-06-18-mobile-ux/mobile-layouts.png`.

### Rack editing

Reached from the Racks tab, which lists racks and opens rack properties (name, size, view). This replaces the current undiscoverable long-press as the entry point.

## Visual language

The aesthetic is rectilinear because racks, U-slots, and devices are all rectangles. Controls use rounded rectangles. Circles and pills are avoided, with the single exception of the small status dot in the storage chip, which reads as a status light. Colours use the existing Dracula-based design tokens.

## Mobile guardrails

Drawn from documented failures of the apps studied:

- Respect `env(safe-area-inset-*)` and use `svh`/`dvh` units so OS bars do not eat the bottom navigation or clip chrome.
- Claim canvas gestures with `touch-action`, and apply a small drag threshold so a tap is never misread as a micro-drag. Pass `{ passive: false }` where `preventDefault` is needed.
- Touch targets are at least 44pt, with the hit area extended beyond the visual device footprint (a 1U slot is short).
- Disable canvas pan while the place or move tool is active, so an edit gesture does not scroll the canvas.
- Every registry action has a visible affordance. Nothing important is reachable only by long-press or double-tap.
- A strong Placing banner keeps the placement state unambiguous.
- Consolidate menus without deleting controls people still need.

## Confirmed bugs (codebase audit)

- Move up and down do nothing: the mobile handler skips the collision check the desktop path runs (`DialogOrchestrator.svelte:526-557`), and the enable test checks only bounds, not neighbours (`DialogOrchestrator.svelte:638-639`). Port the desktop validation from `EditPanelPosition.svelte:47-84` and add a toast on collision.
- Dual selection UI: the canvas verb bar (`VerbBarOverlay`, rendered from `Canvas.svelte`) has no mobile gate and renders on top of the mobile bottom sheet (`DialogOrchestrator.svelte:629`). Gate it off on mobile.
- Tap-to-place: the touch and click placement path is wired end to end (`rack-interaction-handlers.ts`, `Rack.svelte` touchend and click handlers, `RackCanvasView.svelte:112-140`) and even computes valid slots (`Rack.svelte:290-310`). Because the user observed nothing happening, this needs on-device verification before committing a fix: either a real runtime bug or missing drop-zone feedback.
- Empty-rack hint: the audit could not locate the exact "drag devices from the left menu" string; the closest is `DevicePalette.svelte`'s "Add a device to get started". Locate the real string and replace the mobile copy with tap-to-place guidance.
- Pinch-zoom is not explicitly enabled in `panzoom-lifecycle.ts`, and there is no visible zoom control on mobile.
- Rack editing exists via long-press only (`DialogOrchestrator.svelte:847-859`), which is undiscoverable.

Mobile is detected at the 1024px breakpoint (`viewport.svelte.ts:6`). First-run templates already exist (`starter-templates.ts`); mobile polish of the picker is a follow-up, not net-new.

## Feasibility and effort

- View-first: essentially already there; the work is the chrome rebuild around it.
- Moderate editing: near-free. The move fix is roughly 30 minutes; adding flip, duplicate, and notes to the sheet is a few hours.
- The one real editing gap is placement feedback during tap-to-place.

## Decomposition (M12 epic plus children)

Bugs (independent of the redesign, fix now):

- Fix mobile move up and down (collision validation plus toast feedback). [original item 7]
- Diagnose and fix tap-to-place on touch; verify on device, add drop-zone feedback if needed. [item 5]
- Suppress the canvas verb bar on mobile so selection shows one surface. [item 9]
- Locate and fix the mobile empty-rack hint copy. [item 14]

Features and IA:

- Consolidate menus into a single registry-driven app menu; remove the top-bar Save/Load/Export and the lower File menu. [items 1, 3]
- Restructure the top bar: logo app menu, search palette, centred layout name, storage chip. [items 1, 2]
- Bottom navigation: Layouts, Racks, Devices, View, each opening a sheet. [item 11]
- Layout switcher on mobile via the Layouts tab; support multiple layouts. [item 10]
- Discoverable rack editing via the Racks tab. [item 13]
- Mobile selection inspector: registry-driven verbs and fields, with a de-emphasised Remove. [items 6, 8]
- Zoom: pinch and two-finger pan, double-tap to fit, and a visible Fit plus zoom controls in View options. [item 12]
- View options sheet: Display, Read-only lock, zoom and fit. [items 2, 4]

Cross-cutting:

- Registry unification: drive mobile chrome from the shared command and action registry.
- Mobile viewport and gesture foundation: safe-area insets, `svh`/`dvh`, `touch-action`, drag threshold, 44pt targets.

## Open follow-ups

- Light theme: the Theme control was dropped from mobile View options. If light theme is being retired, removing it app-wide (desktop and token plumbing) is a separate small cleanup, filed so the two stay consistent.
- First-run: the existing template picker may need mobile-specific polish so a new user lands on real content.
