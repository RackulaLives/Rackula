# Spike #2097 codebase exploration: current mobile architecture

Source of truth for the current mobile/tablet/phone UI, mapped so the spike can
decide how each surface changes under the new shell.

## Files examined

- `src/lib/utils/viewport.svelte.ts`: viewport/breakpoint detection (module-level runes)
- `src/lib/components/mobile/MobileBottomNav.svelte`: bottom nav (File, View, Devices tabs)
- `src/lib/components/mobile/MobileViewSheet.svelte`: display mode, annotations, theme, zoom
- `src/lib/components/MobileFileSheet.svelte`: file actions (Load, Save, Export, Share, YAML)
- `src/lib/components/mobile/MobileHistoryControls.svelte`: floating undo/redo
- `src/lib/components/RackEditSheet.svelte`: mobile rack editing
- `src/lib/components/DeviceDetails.svelte`: device read-only details + move/remove
- `src/lib/components/BottomSheet.svelte`: bottom-sheet primitive (drag handle, snap, backdrop)
- `src/lib/components/MobileWarningModal.svelte`: first-visit mobile notice
- `src/lib/components/DialogOrchestrator.svelte`: single app-wide dialog/sheet mount point
- `src/lib/components/EditPanel.svelte`: desktop right-drawer orchestrator
- `src/lib/components/EditPanelRack.svelte` / `EditPanelMetadata.svelte` / `EditPanelPosition.svelte` / `EditPanelImage.svelte` / `EditPanelActions.svelte`: decomposed Edit sections (#1398)
- `src/lib/stores/selection.svelte.ts`: device/rack selection state
- `src/lib/stores/dialogs.svelte.ts`: dialog/sheet open state
- `src/lib/styles/tokens.css`: touch-target tokens

## Viewport / breakpoint detection

Module: `src/lib/utils/viewport.svelte.ts`.

- Single binary breakpoint: `MOBILE_BREAKPOINT = '(max-width: 1024px)'`.
- `getViewportStore()` returns `{ isMobile, width }` (getters over module `$state`).
- `isMobile()` standalone check; `initViewport()` wires the MediaQueryList + resize listeners once at startup.
- There is no tablet tier today. Everything at or below 1024px is "mobile",
  so an iPad in portrait gets the full phone treatment (bottom nav, sheets).
- Consumers: `MobileBottomNav`, `Toolbar` (hides sections), `MobileHistoryControls`,
  `DialogOrchestrator` (dialog vs sheet), `Rack` (touch placement), `MobileWarningModal`.

## Current mobile surfaces and what they wrap

- MobileBottomNav: fixed 64px bottom bar with File / View / Devices tabs. Each tab
  opens a sheet via DialogOrchestrator handlers. Desktop equivalent: the Toolbar
  cluster (FileMenu, action buttons). It wraps the trigger, not the sheet content.
- MobileFileSheet: Load, Save, SaveAs, Export, Share, View YAML. Custom mobile-first
  list, does not reuse desktop FileMenu/dialogs. Mounted in DialogOrchestrator inside BottomSheet.
- MobileViewSheet: display mode (SegmentedControl), annotations + theme (Switches),
  Fit All, Reset Zoom. These map to the new View tab and the bottom-left canvas controls on desktop.
- MobileHistoryControls: floating undo/redo, top-right, shown only when `isMobile && (canUndo || canRedo)`.
- RackEditSheet: name, height (+presets), width/bay count, U numbering, rear-view
  toggle, notes, clear rack. Reimplements EditPanelRack logic inline; does NOT reuse the section.
- DeviceDetails: read-only device info (name, height, category, position, manufacturer,
  notes) plus mobile action buttons (move up/down, remove). Does NOT compose any EditPanel section.
- BottomSheet: custom primitive. Drag handle, swipe-to-dismiss (~100px threshold),
  backdrop, focus management, Escape, pointer capture, `env(safe-area-inset-bottom)`. Battle-tested.
- MobileWarningModal: first-visit notice below 1024px, session-scoped, dismissible.

## Selection -> detail flow on mobile today

1. User taps a device on canvas (Rack.svelte handler).
2. Rack calls `selectionStore.selectDevice(rackId, deviceId)`.
3. DialogOrchestrator effect: when `viewportStore.isMobile && device selected`, it
   calls `dialogStore.openSheet("deviceDetails", ...)`.
4. DialogOrchestrator renders `<DeviceDetails showActions>` inside `<BottomSheet>`.

So on mobile, selecting an object already opens a sheet directly. Rack selection
opens RackEditSheet through an equivalent path. Desktop instead auto-opens the right
drawer (EditPanel). This selection-opens-a-surface contract is the load-bearing
behaviour the spike must preserve.

## EditPanel sections and reuse

The five decomposed sections (#1398) are what the new Edit tab (#2077) composes:
EditPanelRack, EditPanelMetadata, EditPanelPosition, EditPanelImage, EditPanelActions.
They are single-entity (one selected rack or device); the host owns empty-state and
multi-select; sections read stores via singleton getters and take only the resolved
selection as a prop.

Mobile sheets do NOT reuse these sections today: RackEditSheet duplicates EditPanelRack
inline, and DeviceDetails is a read-only subset that composes none of them. This is the
duplication #2097 exists to stop: if the Edit tab is built without a mobile reuse
decision, RackEditSheet/DeviceDetails get rebuilt against a panel that no longer exists.

## Dialog vs sheet branching (#2092 context)

Branching is minimal today. Only the YAML editor has an explicit
`isMobile ? openSheet : open`. Device details and file actions are platform-specific
(mobile uses sheets, desktop uses drawer/menus) with no shared adaptive wrapper. #2092
introduces exactly that wrapper: one Dialog primitive that renders centred on desktop
and as a bottom sheet on mobile, S/M/L sizes, migrating the nine dialogs and the mobile
sheets onto it. #2092 sequences before #2076/#2093.

## Touch targets and breakpoint CSS

`tokens.css`: `--touch-target-min: 48px`, `--touch-target-comfortable: 56px`. Applied
on every mobile button/input. Mobile layout is runtime-driven (`{#if isMobile}`), not
CSS media queries; mobile CSS lives in the mobile component files. Safe-area insets are
respected in BottomSheet and MobileBottomNav. The wave-0 UX standard (#2100) mandates 44px minimum.

## Constraints and integration points the spike must respect

- Selection state: `selection.svelte.ts` singleton; `selectDevice()/selectRack()` are the triggers.
- Viewport: `viewport.svelte.ts` singleton; single 1024px breakpoint, no tablet tier.
- Mount point: DialogOrchestrator is the only place dialogs/sheets render; components call the store.
- BottomSheet is the proven mobile-modal primitive; #2092 folds it into the unified Dialog.
- Touch targets stay >= 44px (WCAG 2.2 AA, #2100) with 48/56px tokens already in place.
