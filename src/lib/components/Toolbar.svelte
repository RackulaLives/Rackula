<!--
  Toolbar Component
  Workspace frame, three column-aligned regions (issues #2072, #2324, #2386):
  - Left (fixed, = sidebar width): the unified logo + search pill (#2776). One
    segmented button with a brand/logo tile and a search zone split by a hairline;
    the whole pill opens the command palette (the single command surface, #2775).
    Width tracks --sidebar-width so it aligns with the column below.
  - Centre (flex): the layout tab strip (LayoutTabs) on desktop; on mobile the
    current layout name as a plain centred label (switching lives in the Layouts
    tab, so the mobile name is a label only) (#2458). Spans the canvas gap.
  - Right (fixed, = panel width): the storage chip filling the region. On mobile
    the chip is the right zone (#2458). Width tracks --side-panel-width.
  View and history controls (zoom, fit, display mode, undo, redo) relocate to the
  canvas bottom-left in #2074 / #2458. File and settings commands live in the
  command palette, which the pill opens (#2775).
  The lane widths are held at the expanded column widths in both states, so
  collapsing a side panel never moves or resizes the pill or the tab strip (#2583).
-->
<script lang="ts">
  import LogoLockup from "./LogoLockup.svelte";
  import StorageStatusChip from "./StorageStatusChip.svelte";
  import LayoutTabs from "./LayoutTabs.svelte";
  import { IconSearch } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatShortcut } from "$lib/utils/platform";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

  interface Props {
    partyMode?: boolean;
    /** Export the layout backing a given tab (tab context menu Export). */
    onlayoutexport?: (tabId: string) => void;
  }

  let { partyMode = false, onlayoutexport }: Props = $props();

  const viewportStore = getViewportStore();
  const layoutStore = getLayoutStore();
  const paletteShortcut = formatShortcut("mod", "K");

  // The pill reflects the palette's open state (active styling + aria-expanded).
  const paletteOpen = $derived(dialogStore.isOpen("commandPalette"));

  // Focus the pill before opening so bits-ui captures it as the element to
  // restore focus to when the palette closes. Touch taps do not move keyboard
  // focus on mobile by default, so the explicit focus matters there.
  function openPalette(event: MouseEvent) {
    (event.currentTarget as HTMLElement).focus();
    dialogStore.open("commandPalette");
  }
</script>

<header class="toolbar">
  <!-- Left: the unified logo + search pill (#2776). One button with two visual
       zones (logo tile + search field) split by a hairline; clicking anywhere
       opens the command palette with search focused. On mobile it collapses to a
       compact logo + search-glyph tap target, replacing the former hamburger and
       search buttons. Width = --sidebar-width on desktop so it aligns with the
       column below; held constant across sidebar collapse (#2583). -->
  <div
    class="toolbar-section toolbar-left"
    class:toolbar-left--mobile={viewportStore.isMobile}
  >
    <button
      class="command-pill"
      class:command-pill--mobile={viewportStore.isMobile}
      class:command-pill--active={paletteOpen}
      type="button"
      aria-label="Search or run a command"
      aria-haspopup="dialog"
      aria-expanded={paletteOpen}
      data-testid="btn-command-palette"
      onclick={openPalette}
    >
      <span class="command-pill-logo" aria-hidden="true">
        <LogoLockup
          size={viewportStore.isMobile ? 24 : 28}
          {partyMode}
          showText={false}
        />
      </span>
      <span class="command-pill-divider" aria-hidden="true"></span>
      <span class="command-pill-search">
        <span class="command-pill-search-icon" aria-hidden="true">
          <IconSearch size={ICON_SIZE.sm} />
        </span>
        {#if !viewportStore.isMobile}
          <span class="command-pill-search-text">Search</span>
          <span class="command-pill-badge">{paletteShortcut}</span>
        {/if}
      </span>
    </button>
  </div>

  <!-- Centre: the layout tab strip (desktop) / the current layout name as a
       plain centred label (mobile). On mobile, switching and managing layouts
       lives in the Layouts tab, so the name here is a label only (#2458).
       flex: 1 spans the canvas gap between the left and right zones. -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-tabs">
      <LayoutTabs onexport={onlayoutexport} />
    </div>
  {:else}
    <div class="toolbar-section toolbar-layout-name">
      <span class="toolbar-layout-name-text" data-testid="mobile-layout-name">
        {layoutStore.layout.name}
      </span>
    </div>
  {/if}

  <!-- Right: panel-width region holding the storage chip, which fills the full
       region as the status zone for the side panel beneath it (desktop). On
       mobile the chip is the right zone (#2458). Width = --side-panel-width,
       held constant across panel collapse so the tab strip never moves (#2583). -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-right">
      <StorageStatusChip />
    </div>
  {:else}
    <div class="toolbar-section toolbar-right toolbar-right-mobile">
      <StorageStatusChip />
    </div>
  {/if}
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--toolbar-height);
    background: var(--colour-toolbar-bg, var(--toolbar-bg));
    border-bottom: 1px solid var(--colour-toolbar-border, var(--toolbar-border));
    flex-shrink: 0;
    position: relative;
    z-index: var(--z-toolbar);
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 100%;
  }

  /* Left lane: fixed to the sidebar column width. Left padding gives the pill
     ~8px from the edge. The width is held at the expanded column width in both
     states so the pill and the centre tab strip keep a constant size and
     position regardless of whether the sidebar is collapsed (#2583). */
  .toolbar-left {
    flex: 0 0 var(--sidebar-width, 320px);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    min-width: 0;
  }

  /* Mobile left lane: there is no column to align with, so the lane shrinks to
     its natural width (the compact pill). This lets the centred layout name
     actually centre between the left and right zones (#2458). */
  .toolbar-left--mobile {
    flex: 0 0 auto;
    padding-left: max(var(--space-2), env(safe-area-inset-left, 0px));
  }

  /* Centre lane: fills the canvas gap between left and right fixed lanes. The
     left margin keeps the first tab clear of the pill so the two do not crowd
     at the lane boundary. */
  .toolbar-tabs {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-start;
    margin-left: var(--space-3);
  }

  /* Right lane: fixed to side-panel width. The storage chip is the sole
     occupant and fills the lane as the status zone (#2398). The width is held
     at the expanded column width in both states so the centre tab strip keeps a
     constant size and position regardless of whether the panel is collapsed
     (#2583). */
  .toolbar-right {
    flex: 0 0 var(--side-panel-width, 320px);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    justify-content: flex-start;
    gap: var(--space-1);
  }

  /* The chip stretches to fill the right region so it reads as the panel's
     status zone rather than a small pill pinned to the edge, with its icon and
     label centred within that zone. */
  .toolbar-right :global(.storage-chip) {
    flex: 1 1 auto;
    justify-content: center;
  }

  /* Mobile centre lane: the current layout name as a plain centred label. It
     takes the slack between the left and right zones and truncates rather than
     wrapping so the three-zone bar stays one row (#2458). */
  .toolbar-layout-name {
    flex: 1 1 auto;
    min-width: 0;
    justify-content: center;
    padding: 0 var(--space-2);
  }

  .toolbar-layout-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--colour-text);
  }

  /* Mobile right lane: the storage chip pinned to the right edge (#2458). */
  .toolbar-right-mobile {
    flex: 0 0 auto;
    padding-right: max(var(--space-2), env(safe-area-inset-right, 0px));
    justify-content: flex-end;
  }

  /* Unified logo + search pill (#2776): one rounded button with two visual
     zones (logo tile + search field) split by a hairline. The whole control is
     the hit target and opens the command palette; hover, focus, and active
     styles apply to the entire pill, never a single zone, so it reads as one
     button. The field flexes to fill the lane after the fixed-width logo tile. */
  .command-pill {
    display: inline-flex;
    align-items: center;
    align-self: center;
    flex: 1 1 auto;
    min-width: 0;
    height: 40px;
    padding: 0;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text-muted);
    cursor: pointer;
    overflow: hidden;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .command-pill:hover,
  .command-pill--active {
    border-color: var(--colour-selection);
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .command-pill:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  /* Logo tile: fixed width, left zone. */
  .command-pill-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    height: 100%;
    padding: 0 var(--space-2);
  }

  /* Hairline between the logo tile and the search zone (brand/visual only, not
     a functional split). */
  .command-pill-divider {
    flex: 0 0 auto;
    align-self: stretch;
    width: 1px;
    margin: var(--space-2) 0;
    background: var(--colour-border);
  }

  /* Search zone: flexes to fill the lane after the fixed-width logo tile. */
  .command-pill-search {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0 var(--space-3);
    font-size: var(--font-size-sm);
  }

  .command-pill-search-icon {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
  }

  .command-pill-search-icon :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  /* The hint label takes the slack so the shortcut badge stays pinned right and
     the field reads as a full-width search affordance. Truncates rather than
     wrapping if the lane is narrow. */
  .command-pill-search-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .command-pill-badge {
    flex: 0 0 auto;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-xs);
    padding: 1px var(--space-1);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }

  /* Mobile: a compact one-tap pill (logo tile + search glyph), sized to a true
     44px touch target (WCAG 2.5.5) at its natural width. The Cmd+K badge and the
     "Search" label are hidden on mobile (the search glyph is the signal). */
  .command-pill--mobile {
    flex: 0 0 auto;
    height: var(--touch-target-min);
  }

  .command-pill--mobile .command-pill-search {
    padding: 0 var(--space-2);
  }

  @media (prefers-reduced-motion: reduce) {
    .command-pill {
      transition: none;
    }
  }
</style>
