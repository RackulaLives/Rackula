# Spike #2437 Codebase Findings

How the two side panels collapse today, and where a clickable-border affordance would attach.

## Files Examined

- `src/lib/components/SidePanel.svelte` (166 lines): right-panel chrome. Holds the `aside.side-panel`, toggles between `CollapsedPanelStrip` (collapsed) and `SidePanelContent` (expanded). Owns expand/collapse focus management (#2076).
- `src/lib/components/SidePanelContent.svelte` (410 lines): the tabbed Edit/View content. Renders the in-row collapse chevron `.side-panel-collapse-btn` (IconChevronRight, `»`) at the far-right of the tab row when an `oncollapse` prop is passed.
- `src/lib/components/SidebarTabs.svelte` (190 lines): left-panel tab row (Layouts / Racks / Devices). Renders the in-row collapse chevron `.sidebar-collapse-btn` (IconChevronLeft, `«`) at the far-left of the tab row.
- `src/lib/components/CollapsedPanelStrip.svelte` (113 lines): the shared 44px collapsed strip for BOTH panels, mirrored via a `side` prop. The whole strip is one reopen button.
- `src/App.svelte` (around lines 561-603): composes the left panel directly as `aside.sidebar-panel`, switching between `CollapsedPanelStrip` and `SidebarTabs` + the active list. Defines `handleCollapseSidebar` / `handleExpandSidebar`.
- `src/lib/stores/ui.svelte.ts`: holds `sidebarCollapsed` and `sidePanelCollapsed` `$state`, with `setSidebarCollapsed`, `toggleSidebarCollapsed`, `setSidePanelCollapsed`, `toggleSidePanelCollapsed`. Both persist to localStorage and restore on load.
- `src/lib/styles/tokens.css`: relevant tokens are `--colour-border`, `--colour-border-hover`, `--colour-surface-hover`, `--colour-selection`, `--side-panel-width: 320px`, `--panel-collapsed-strip-width: 44px`.

## Existing Patterns

- Symmetric design: both panels collapse outward to an identical 44px strip via the same `CollapsedPanelStrip` component (#2397). The strip shows a reopen chevron plus the active tab name as a rotated vertical label, and is itself one big button.
- Expanded, each panel exposes a single 44px-square chevron button in its tab row: `«` on the left panel (far-left), `»` on the right panel (far-right). Both point toward the edge they collapse to.
- Collapse state is centralised in the UI store and persisted, so any new affordance just needs to call the same `set*Collapsed(true)` setters. No new state is required.
- The right panel auto-expands on selection (`SidePanel.svelte` effect on `selectionStore.hasSelection`); the left panel does not auto-collapse.
- Edges: the expanded right panel draws `border-left: 1px solid var(--colour-border)`; the left panel draws its border on the inner edge of its content. The collapsed strips draw their own outer border (`--left` border-right, `--right` border-left). There is currently no interactive behaviour on these borders.

## Integration Points

A clickable-border affordance would attach at the panel edge that faces the canvas:

- Right panel: the `border-left` of `aside.side-panel` in `SidePanel.svelte`. A grip element would live inside that aside, absolutely positioned on the left edge.
- Left panel: the inner (canvas-facing, right) edge of `aside.sidebar-panel` in `App.svelte`. A grip would live inside that aside, absolutely positioned on the right edge.
- Both grips would call the existing `handleCollapse*` / `set*Collapsed(true)` handlers. No store change needed.
- Mobile is unaffected: both the strip and the in-row chevron are desktop/tablet only; on phone the same content composes into a bottom sheet. Any border grip must also be gated to non-mobile.

## Constraints

- Svelte 5 runes only (`$state`, `$derived`, `$effect`); no Svelte 4 stores.
- Touch standard: interactive targets are 44px on mobile (ACCESSIBILITY standards, #2100). A border-only target is far thinner than 44px, so a border-collapse must not be the only collapse path on touch and needs an adequately sized hit area on pointer devices.
- A11y: panels are labelled landmarks; expand moves focus to the active tab heading, collapse returns focus to the strip reopen button (#2076). Any new control must be keyboard reachable and not strand focus. A grip should not become a second confusing tab stop with an unclear label.
- `prefers-reduced-motion: reduce` is respected throughout; any grip reveal animation must honour it.
- The collapsed strip (reopen path) is already a large, discoverable target. The open question is only the COLLAPSE (close) affordance, not reopen.
- The fixed 320px panel width keeps canvas fit-to-view stable; a border-collapse must not turn into a drag-to-resize handle (out of scope, would change width).
