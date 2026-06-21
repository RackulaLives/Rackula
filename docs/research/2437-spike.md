# Spike #2437: Collapse Affordance for Side Panels (Clickable Border vs Chevron)

Date: 2026-06-20 Milestone: M014 -- Canvas UX Overhaul Epic: #2017

## Research Question

Can the collapse chevron on both side panels, the left device panel and the right edit panel, be replaced by a clickable panel border or edge without losing discoverability?

## Recommendation

HYBRID, with a clean fallback to KEEP.

Do not replace the chevron with a clickable border alone. A border-only collapse is a hidden affordance: the click works but nothing on screen tells a first-time or touch user that it is there. Both the UX literature (Don Norman on signifiers, NN/g on clickability) and the reference editors (VS Code, Figma) reject a bare clickable border as the sole collapse control. The literal answer to the spike question is therefore no.

The retained chevron stays the primary, guaranteed-discoverable control on both panels. If an edge interaction is wanted, ADD a hover-revealed grip on each panel's canvas-facing edge as a power-user shortcut for mouse users, mirroring how VS Code layers a visible control plus an edge affordance. The grip is purely additive: if a user never finds it, nothing is lost because the chevron is still there. If the appetite is to avoid adding chrome for a marginal mouse-only gain, KEEP is the honest default and the spike still closes with a firm no to replace.

## Executive Summary

The reopen path is already solved: collapsed, each panel is a 44px strip that is one large labelled button. This spike concerns only the collapse (close) path, which today is a visible 44px chevron in each panel's tab row (`«` far-left on the device panel, `»` far-right on the edit panel).

Replacing that chevron with a clickable border would trade a known-discoverable control for a hidden one. The evidence is consistent across three angles:

- Precedent: VS Code and Figma both keep a persistently visible collapse affordance plus a keyboard shortcut. In VS Code the draggable border is a resize sash, separate from collapsing, and never the only way in.
- Principle: a clickable border is an affordance without a signifier. Norman's rule is that design must provide perceptible signifiers, not just latent affordances. NN/g warns that users will not play a "minesweeping game" to find invisible clickable zones.
- Accessibility: a hover-revealed grip is invisible on touch (no hover events) and is missed by users who never hover the exact edge. A thin border also fails WCAG 2.2 target-size guidance unless its hit area is padded to 24px or more.

A hybrid keeps the chevron as the at-rest signifier and adds the grip as an extra, low-risk entry point for mouse users.

## Technical Findings (Codebase)

How the two panels collapse today, and where a border affordance would attach.

Components:

- `src/lib/components/SidePanel.svelte`: right-panel chrome. Switches between `CollapsedPanelStrip` (collapsed) and `SidePanelContent` (expanded). Owns expand/collapse focus management (#2076).
- `src/lib/components/SidePanelContent.svelte`: tabbed Edit/View content; renders the right panel's in-row collapse chevron `.side-panel-collapse-btn` (IconChevronRight) at the far-right of the tab row.
- `src/lib/components/SidebarTabs.svelte`: left-panel tab row; renders the left panel's in-row collapse chevron `.sidebar-collapse-btn` (IconChevronLeft) at the far-left of the tab row.
- `src/lib/components/CollapsedPanelStrip.svelte`: the shared 44px collapsed strip for both panels, mirrored via a `side` prop. The whole strip is the reopen button.
- `src/App.svelte` (around lines 561-603): composes the left panel as `aside.sidebar-panel`; defines `handleCollapseSidebar` / `handleExpandSidebar`.
- `src/lib/stores/ui.svelte.ts`: holds `sidebarCollapsed` / `sidePanelCollapsed` `$state` with `setSidebarCollapsed`, `setSidePanelCollapsed` (and toggles), persisted to localStorage.
- `src/lib/utils/viewport.svelte.ts`: `getViewportStore().isMobile`, the existing gate for desktop/tablet-only chrome.

Tokens: `--colour-border`, `--colour-border-hover`, `--colour-surface-hover`, `--colour-selection`, `--side-panel-width: 320px`, `--panel-collapsed-strip-width: 44px`.

Where a grip attaches:

- Right panel: the `border-left` edge of `aside.side-panel` in `SidePanel.svelte`. A grip lives inside that aside, absolutely positioned on the left (canvas-facing) edge.
- Left panel: the inner (right, canvas-facing) edge of `aside.sidebar-panel` in `App.svelte`. A grip lives inside that aside on the right edge.
- Both call the existing `handleCollapse*` / `set*Collapsed(true)` handlers. No store change is required. Both must be gated to non-mobile via `viewportStore.isMobile`.

Constraints worth carrying into implementation:

- Svelte 5 runes only.
- Touch standard 44px; a border is far thinner, so it must not be the only collapse path on touch and needs a padded hit area on pointer devices.
- A11y focus management (#2076) must not be disrupted; a new grip should not become a confusing second tab stop with an unclear label.
- `prefers-reduced-motion: reduce` must disable any reveal animation.
- The 320px fixed width keeps fit-to-view stable; the grip collapses, it does not drag-to-resize (resize is out of scope).

## Prototype (Deliverable 1)

A throwaway prototype is in `docs/research/prototype-border-collapse-grip.svelte`. It is a self-contained `PanelEdgeGrip` component, validated clean by the Svelte autofixer, not wired into the app. It demonstrates the hybrid shape: a full-height edge button that at rest reads as the 1px panel border, and on hover or focus widens the line, reveals a small grip handle, and shows a pointer cursor. It calls an `oncollapse` prop.

Concrete wiring in the real components:

- Right panel: place `<PanelEdgeGrip side="left" oncollapse={handleCollapse} />` inside `aside.side-panel` (which is already `position: relative`) in `SidePanel.svelte`.
- Left panel: place `<PanelEdgeGrip side="right" oncollapse={handleCollapseSidebar} />` inside `aside.sidebar-panel` in `App.svelte`.
- Gate both with `{#if !viewportStore.isMobile}`.
- No change to the collapsed strip, the chevron, or the UI store.

The hit area in the prototype is 10px wide for illustration; a production build should pad it to at least 24px (WCAG 2.2 SC 2.5.8) while keeping the visible line at 1 to 2px.

## External Research (Deliverable 2: Discoverability Comparison)

Full notes and sources are in `docs/research/2437-external.md`. Key points:

Precedent:

- VS Code keeps multiple visible affordances for collapsing the Primary Side Bar: Ctrl/Cmd+B, a persistent Activity Bar, View-menu items, and a layout control. The draggable border between side bar and editor is a resize sash, distinct from collapsing, and is never the only entry point.
- Figma (UI3) minimises and expands panels with Shift+\ and via a visible minimise-UI button and collapse arrows. Users have asked for the older independent left/right collapse back, which shows the collapse control is something users expect to find, not hunt for.

Hidden vs visible affordance:

- Don Norman, "Signifiers, not affordances": affordances need not be perceivable to exist, so "what people need, and what design must provide, are signifiers." A clickable border is an affordance with a missing signifier.
- NN/g, "Beyond Blue Links": users will not play a "minesweeping game" hunting for clickable zones, and over-minimal design that strips visible cues creates exactly that ambiguity.

Hover-revealed grip limits:

- Touch devices generate no hover events, so a hover-gated grip is invisible to mobile and tablet users.
- First-time mouse users may never move the pointer onto the exact 1px edge, so the reveal never fires. The cursor change only communicates after the pointer is already over the target. The grip reinforces an at-rest signifier; it cannot replace one.

Hit-target sizing:

- WCAG 2.2 SC 2.5.8 (AA): 24x24 CSS px minimum, or equivalent spacing.
- WCAG 2.2 SC 2.5.5 (AAA), Apple HIG, Material: 44 to 48 px for touch.
- A 1 to 2px border must pad its hit area accordingly and stay distinct from any resize sash.

Discoverability comparison, current chevron vs border-collapse:

| Attribute | Current chevron | Border-only | Border + hover grip |
| --- | --- | --- | --- |
| Visible at rest | Yes | No | No (grip on hover) |
| Works on touch | Yes | Marginal | Marginal |
| Keyboard reachable | Yes | Needs work | Needs work |
| Meets WCAG 2.2 target | Yes (44px) | No (1-2px) | Needs padded area |
| Matches VS Code / Figma | Partial | No | As a secondary only |

The chevron wins on discoverability on every axis. A border, with or without a hover grip, is at best a secondary affordance.

## Recommendation Detail (Deliverable 3)

REPLACE: rejected. It removes the only at-rest signifier and the touch path, and diverges from both reference editors. This is precisely the discoverability loss the spike asked us to avoid.

KEEP: the safe default. Zero work, zero risk, already shipped and tested. The only cost is the stated aesthetic one, a small chevron in each tab row.

HYBRID: recommended if an edge interaction is wanted. Keep both chevrons exactly as they are and add the `PanelEdgeGrip` on each canvas-facing edge for mouse users. Low cost (about 30 to 60 lines including shared styling), low risk (purely additive, the chevron remains the guaranteed path), and it matches how VS Code layers controls. A follow-up implementation issue is filed for this.

## Follow-up Issue (Deliverable 4)

Filed as the hybrid implementation task in milestone M014 -- Canvas UX Overhaul:

- #2553: feat: add hover-revealed edge grip as a secondary panel collapse affordance (hybrid). Keeps the chevron, adds the grip, gated to non-mobile, hit area padded to WCAG 2.2 target size, no store change.

If the team prefers KEEP over HYBRID, close #2553 as not-planned; the spike's core answer (do not replace the chevron with a bare border) holds either way.

## Source Files

- `docs/research/2437-codebase.md`
- `docs/research/2437-external.md`
- `docs/research/2437-patterns.md`
- `docs/research/prototype-border-collapse-grip.svelte`
