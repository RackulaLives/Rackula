# Spike #2097: Mobile adaptation of the new shell

Date: 2026-06-14
Epic: #2017 (Canvas UX Overhaul)
Milestone: M14 (design call), implementation deferred to M12
Status: complete

Supporting research: `2097-codebase.md`.

---

## Executive summary

The new shell already has a mobile dual built into its core principle. Desktop says
verbs float and properties dock: object verbs float above the object, properties dock in
the right side panel. On mobile the same sentence holds with one substitution: properties
dock into a bottom sheet instead of a side rail, and the verbs dock with them rather than
floating on the canvas. Nothing new has to be invented; the shell's structure maps onto
the mobile primitives Rackula already ships.

The binding decisions:

1. Mobile reuses the side panel's content, not a parallel build. The Edit tab composes
   the decomposed #1398 sections (EditPanelRack/Metadata/Position/Image/Actions). On
   mobile the same sections render inside a bottom sheet driven by the #2092 unified
   dialog. RackEditSheet and DeviceDetails are retired; their inline, duplicated field
   rendering is replaced by the shared sections. This is the whole reason the spike runs
   before #2076/#2075: so the panel is the single home for properties on every viewport.

2. MobileBottomNav is replaced by a single canvas-edge action bar, not rebuilt as tabs.
   Its File and View jobs move into the app menu (reached from the logo) and the View
   tab; its Devices job stays a sheet. Layout tabs do NOT appear on mobile: the tab strip
   collapses to the active layout name plus a switcher in the app menu. One user on a
   phone works one layout at a time; the tab strip is a desktop multi-open affordance.

3. Verb bars do not float on mobile. Selection opens the bottom sheet, and the verbs live
   at the top of that sheet as full-width touch rows. This is exactly today's contract
   (tap a device, a sheet opens) carried forward, and it sidesteps the unresolved
   low-zoom floating-bar problem entirely on touch.

4. Desktop-only for now, with a named fallback for each: floating verb bars (fallback:
   sheet verb rows), the persistent collapsible side rail (fallback: on-demand bottom
   sheet), the multi-tab strip (fallback: active-name + app-menu switcher), drag-to-reorder
   tabs and hover affordances (fallback: none needed, no hover on touch).

5. Tablet follows desktop, not phone. The shell needs a real tablet tier. A tablet in
   landscape has room for the side rail and the tab strip and should get the desktop
   shell; only the phone tier gets sheets. This requires splitting today's single 1024px
   `isMobile` breakpoint into phone and tablet tiers, which is the one piece of net-new
   plumbing this spike asks for.

None of these are product judgement calls that need the maintainer. They follow from the
shell's own scope-based principle and the primitives already in the tree.

---

## Recommendations per spike question

### 1. Does mobile reuse the side panel content inside a bottom sheet?

Yes. The Edit tab and the mobile detail sheet are the same content in two containers.

The #1398 sections were decomposed precisely so a host can compose them. The desktop host
is the Edit tab inside the side panel; the mobile host is a bottom sheet. Both compose
EditPanelRack for a selected rack and EditPanelMetadata + EditPanelPosition + EditPanelImage
+ EditPanelActions for a selected device. The host owns empty-state and multi-select
orchestration in both cases; the sections never branch on viewport.

This deletes the current duplication: RackEditSheet reimplements EditPanelRack inline, and
DeviceDetails is a read-only subset that composes none of the sections. Both are removed.
Mobile gains full edit parity, because it now renders the same editable sections desktop
does rather than a hand-maintained read-only view.

Reuse means one content source, not a field dump. A section may still collapse or defer a
field on a phone (for example progressively disclosing power ratings, IP, or image overrides
behind a "more" affordance) without forking the component. The decision is that there is one
section per concern feeding both viewports; which fields a phone surfaces first is a
responsive presentation choice inside each section, settled in the M12 issue, not a reason to
keep a second component.

The container is the #2092 unified Dialog, which already renders as a bottom sheet below
the phone breakpoint with the same API. So the Edit tab content, wrapped in the unified
Dialog, is a centred panel region on desktop/tablet and a drag-handle bottom sheet on
phone with no second component.

The View tab gets the same treatment: on phone it is a second sheet (or a segmented
control at the top of the same sheet) holding the layout-scoped view toggles, replacing
MobileViewSheet's bespoke rendering with the View tab's content.

Sequencing note: this depends on #2092 landing first (it is already sequenced before
#2076) and on the Edit tab (#2077) composing the sections. The mobile sheet host is a thin
adapter over the same composition, filed as a phone follow-up.

### 2. What replaces MobileBottomNav? Do layout tabs appear on mobile?

MobileBottomNav is replaced by a slim canvas-edge action bar, and its three jobs
redistribute by scope, matching the desktop shell:

- File tab -> the app menu, reached from the logo in the top bar (the top bar stays on
  phone, just denser). The app menu is already the lean home for new/open/import/export/
  share/YAML; on phone it opens as a sheet. MobileFileSheet's contents become the app
  menu's contents.
- View tab -> the View tab of the side panel, surfaced on phone as a sheet (see Q1).
- Devices tab -> stays a sheet. Device search and placement are a phone-first sheet over
  the existing Devices sidebar content, opened from the action bar.

The canvas-edge action bar carries only what must be one tap away on a phone: open
Devices (to place), open the app menu, and the bottom-left canvas controls (undo/redo,
zoom, fit, display-mode lens) which the shell already places on the canvas and which work
unchanged at touch size. MobileHistoryControls folds into that canvas control group.

Layout tabs do NOT appear on phone. The tab strip is a desktop multi-open workbench
affordance (drag-reorder, hover-close, chevron overflow) that has no good phone form and
no phone need: a phone user edits one layout at a time. On phone the top bar shows the
active layout name; switching layouts is an item in the app menu that lists the open set
and the library (reusing the sidebar Layouts list as a sheet). The per-layout session
restore still applies; the phone simply restores to the last active layout rather than a
visible strip. Tablet keeps the full tab strip (see Tablet tier).

### 3. Do floating verb bars work at touch, or does selection open the sheet directly?

Selection opens the sheet directly. Verb bars do not float on phone.

Floating verb bars are a pointer-precision affordance. The spec itself flags the
unresolved low-zoom problem: at constant screen size the bar can dwarf and mis-aim at its
target. On a phone every interaction is low-precision and the canvas is small, so a
floating bar is the worst case. Instead, the existing mobile contract carries forward:
tapping a device or rack opens its bottom sheet, and the verbs live as full-width touch
rows at the top of that sheet (device: move up, move down, flip face, duplicate, delete,
and the slot control when half-width; rack: duplicate, focus, export, delete). DeviceDetails
already does a subset of this (move up/down, remove); the sheet verb row generalises it
and sources the same command set the desktop verb bar uses.

Because both the desktop floating bar and the mobile sheet row project the same command
set (the #2096 registry is the single source), there is no second action list to maintain.
The verb bar's keyboard-accessibility AC is satisfied differently per platform: focus order
through the floating bar on desktop, native sheet focus order on phone. Right-click mirrors
the verbs on desktop; long-press is the phone mirror and simply re-opens the same sheet.

Tablet is the judgement edge: a tablet has pointer precision via touch but a larger canvas.
The recommendation is that tablet follows desktop (floating bars) since it gets the desktop
shell; if floating bars prove too small for touch on tablet during implementation, the
fallback is the same sheet rows, gated on the phone-or-coarse-pointer condition rather than
strictly phone width.

### 4. Which shell pieces are desktop-only, and what is the phone fallback?

| Shell piece | Phone status | Fallback |
| --- | --- | --- |
| Side panel persistent collapsible rail | Desktop/tablet only | On-demand bottom sheet (Edit tab content via #2092), opened by selection |
| Floating verb bars | Desktop/tablet only | Verb rows at the top of the selection sheet |
| Layout tab strip (drag-reorder, hover-close, chevron overflow) | Desktop/tablet only | Active layout name in the top bar + switcher in the app menu |
| Bottom-left canvas controls (undo/redo, zoom, fit, lens) | Kept on all viewports | None needed; already touch-sized |
| Top bar (logo/app menu, storage chip, settings) | Kept, denser on phone | Tab strip slot becomes the active-name label |
| Sidebar Layouts/Devices/Racks tabs | Surfaced as sheets on phone | Devices sheet for placement; Layouts list as a switcher sheet |
| Creation by placing (hover-reveal new rack, drag preview) | Adapted | Phone: explicit Add rack button in the empty state + Devices sheet placement; no hover affordance |

Hover-dependent affordances (tab close x on hover, new-rack-on-hover, per-row sidebar
actions on hover) have no phone form and fall back to explicit buttons or long-press, which
the codebase already uses.

### Tablet tier (net-new plumbing)

The shell needs a tablet tier that today's single 1024px `isMobile` breakpoint does not
provide. A landscape tablet has room for the side rail and the tab strip and should get the
desktop shell, not the phone sheet treatment an iPad gets today.

Recommendation: split the viewport store into three tiers. Keep `isMobile` as the phone
signal (suggest `<= 768px` or a coarse-pointer check), add `isTablet` for the middle band,
and treat tablet as desktop for shell layout. Phone is the only tier that swaps the side
rail for sheets and hides the tab strip. The exact phone/tablet boundary and whether to key
on width or `pointer: coarse` is an implementation detail for the breakpoint issue, not a
product decision. This is the only piece of net-new infrastructure the mobile work needs;
everything else is reuse of #1398 sections, the #2092 unified dialog, the #2096 command
registry, and the existing BottomSheet.

---

## Technical findings (from the codebase)

- `viewport.svelte.ts` has one binary breakpoint at 1024px; no tablet tier. Splitting it is
  the only net-new plumbing.
- The #1398 sections are already host-composable and viewport-agnostic, so reusing them in a
  sheet is a host-adapter change, not a section rewrite.
- #2092 already renders the unified Dialog as a bottom sheet below the mobile breakpoint with
  the same API, so the Edit tab content needs no second mobile component.
- BottomSheet is a proven primitive (drag handle, swipe-dismiss, focus management, safe-area
  insets); #2092 folds it in, so the mobile sheet host inherits all of it.
- The #2096 command registry is the single source for verbs, so the sheet verb rows and the
  desktop floating bars cannot drift.
- DialogOrchestrator is the single mount point; the phone Edit/View/Devices sheets mount
  there, keeping the no-local-dialogs invariant.

## What this constrains downstream

- #2076 (side panel): the panel must be a content host over the #1398 sections, with the
  Edit-tab composition extractable so a phone bottom-sheet host can reuse it. Build the panel
  so its Edit/View content is not welded to the persistent-rail chrome.
- #2075 (verb bars): record desktop-only for the floating presentation. The phone affordance
  is sheet verb rows over the same registry command set. Both project #2096; do not build a
  second mobile action list. Long-press is the phone mirror of right-click.
- #2092 (unified dialog): is the mobile container for the Edit/View/Devices sheets; must land
  before the phone reuse work.
- A new breakpoint issue (M12): split `isMobile` into phone/tablet tiers; tablet gets the
  desktop shell.

## Implementation decomposition (M12 follow-ups)

Filed into M12 mobile, sequenced after #2076/#2077/#2078/#2092 land on desktop:

1. Viewport tier split: phone/tablet breakpoints; tablet -> desktop shell. Prerequisite.
2. Phone Edit/View sheets: bottom-sheet host that composes the #1398 sections and the View
   tab content via the #2092 dialog; retire RackEditSheet, DeviceDetails, MobileViewSheet.
3. Phone shell frame: canvas-edge action bar replacing MobileBottomNav; app menu as a sheet
   absorbing MobileFileSheet; active-layout name + app-menu layout switcher replacing tabs;
   fold MobileHistoryControls into the canvas controls.
4. Phone verb rows: selection-opens-sheet with verb rows at the top, projected from #2096;
   long-press mirror; retire the floating bar on phone.
