<!--
  Toolbar Component
  Workspace frame, three column-aligned regions (issues #2072, #2324, #2386):
  - Left (fixed, = sidebar width): logo lockup (the app menu) + command-palette
    search field. The field fills the region after the logo, up to the tab strip
    (#2398). Width tracks --sidebar-width so it aligns with the column below.
  - Centre (flex): the layout tab strip (LayoutTabs) on desktop; on mobile the
    current layout name as a plain centred label (switching lives in the Layouts
    tab, so the mobile name is a label only) (#2458). Spans the canvas gap.
  - Right (fixed, = panel width): the storage chip filling the region. On mobile
    the chip is the right zone (it replaces the old quick file actions, which now
    live in the registry-driven app menu) (#2458). Width tracks --side-panel-width.
    The Settings gear moved into the app menu (#2398) and the side-panel
    collapse/expand chevron lives in the panel itself (#2397).
  View and history controls (zoom, fit, display mode, undo, redo) relocate to the
  canvas bottom-left in #2074 / #2458. File and settings commands live in the app
  menu behind the logo.
-->
<script lang="ts">
  import AppMenu from "./AppMenu.svelte";
  import StorageStatusChip from "./StorageStatusChip.svelte";
  import LayoutTabs from "./LayoutTabs.svelte";
  import type { ActionId } from "$lib/actions/registry";
  import { IconSearch } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatShortcut } from "$lib/utils/platform";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

  interface Props {
    hasRacks?: boolean;
    partyMode?: boolean;
    /** Left sidebar collapsed: shrink the left lane to align with the strip. */
    sidebarCollapsed?: boolean;
    /** Right panel collapsed: shrink the right lane to align with the strip. */
    sidePanelCollapsed?: boolean;
    onsave?: () => void;
    onsaveas?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    onviewyaml?: () => void;
    onimportdevices?: () => void;
    onimportnetbox?: () => void;
    onnewcustomdevice?: () => void;
    onsettings?: () => void;
    onhelp?: () => void;
    onnewlayout?: () => void;
    /** Export the layout backing a given tab (tab context menu Export). */
    onlayoutexport?: (tabId: string) => void;
  }

  let {
    hasRacks = false,
    partyMode = false,
    sidebarCollapsed = false,
    sidePanelCollapsed = false,
    onsave,
    onsaveas,
    onload,
    onexport,
    onshare,
    onviewyaml,
    onimportdevices,
    onimportnetbox,
    onnewcustomdevice,
    onsettings,
    onhelp,
    onnewlayout,
    onlayoutexport,
  }: Props = $props();

  const viewportStore = getViewportStore();
  const layoutStore = getLayoutStore();
  const paletteShortcut = formatShortcut("mod", "K");

  // Dispatch map from app-menu action id to its handler. The menu items
  // themselves come from the registry (AppMenu projects getAppMenuSections);
  // this binds each id to the closure that runs it, mirroring how
  // KeyboardHandler binds the same ids to keyboard shortcuts.
  const appMenuDispatch: Partial<Record<ActionId, () => void>> = {
    "new-layout": () => onnewlayout?.(),
    load: () => onload?.(),
    save: () => onsave?.(),
    "save-as": () => onsaveas?.(),
    "export-backup": () => onsaveas?.(),
    export: () => onexport?.(),
    share: () => onshare?.(),
    "view-yaml": () => onviewyaml?.(),
    "import-devices": () => onimportdevices?.(),
    "import-netbox": () => onimportnetbox?.(),
    "new-custom-device": () => onnewcustomdevice?.(),
    "show-help": () => onhelp?.(),
    settings: () => onsettings?.(),
  };

  function handleAppMenuAction(id: ActionId) {
    appMenuDispatch[id]?.();
  }
</script>

<header class="toolbar">
  <!-- Left: Logo (also the app menu) + command palette pill.
       Width = --sidebar-width so it aligns with the column below; shrinks to
       natural width when the sidebar is collapsed to its 44px strip (#2397). -->
  <div
    class="toolbar-section toolbar-left"
    class:toolbar-left--collapsed={sidebarCollapsed}
    class:toolbar-left--mobile={viewportStore.isMobile}
  >
    <AppMenu onaction={handleAppMenuAction} {hasRacks} {partyMode} />
    <button
      class="command-pill"
      class:command-pill--icon={viewportStore.isMobile}
      type="button"
      aria-label="Search or jump to a command"
      onclick={() => dialogStore.open("commandPalette")}
      data-testid="btn-command-palette"
    >
      <span class="command-pill-visual">
        <span class="command-pill-icon" aria-hidden="true"
          ><IconSearch size={ICON_SIZE.sm} /></span
        >
        {#if !viewportStore.isMobile}
          <span class="command-pill-text">Search or jump to...</span>
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
       mobile the chip is the right zone (#2458): it replaces the old quick file
       actions, whose Save / Load / Export now live in the registry-driven app
       menu behind the logo. The Settings gear moved into the app menu (#2398)
       and the side-panel collapse/expand chevron lives in the panel (#2397). -->
  {#if !viewportStore.isMobile}
    <div
      class="toolbar-section toolbar-right"
      class:toolbar-right--collapsed={sidePanelCollapsed}
    >
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

  /* Left lane: fixed to the sidebar column width so it aligns with the column
     below. Left padding gives the logo ~8px from the edge. When the sidebar is
     collapsed to its 44px strip, the lane shrinks to its natural width so it
     does not overhang the strip (#2397). */
  .toolbar-left {
    flex: 0 0 var(--sidebar-width, 320px);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    min-width: 0;
  }

  .toolbar-left--collapsed {
    flex: 0 0 auto;
  }

  /* Mobile left lane: there is no column to align with, so the lane shrinks to
     its natural width (logo + compact search icon). This lets the centred layout
     name actually centre between the left and right zones (#2458). */
  .toolbar-left--mobile {
    flex: 0 0 auto;
    padding-left: max(var(--space-2), env(safe-area-inset-left, 0px));
  }

  /* Centre lane: fills the canvas gap between left and right fixed lanes. */
  .toolbar-tabs {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-start;
  }

  /* Right lane: fixed to side-panel width so it aligns with the panel column.
     The storage chip is now the sole occupant and fills the lane as the status
     zone for the panel beneath it (#2398). Shrinks to its natural width (pinned
     to the right edge) when the panel is collapsed to its 44px strip, so the
     chip never overhangs it (#2397). */
  .toolbar-right {
    flex: 0 0 var(--side-panel-width, 320px);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    justify-content: flex-start;
    gap: var(--space-1);
  }

  /* The chip stretches to fill the right region so it reads as the panel's
     status zone rather than a small pill pinned to the edge. */
  .toolbar-right :global(.storage-chip) {
    flex: 1 1 auto;
    justify-content: flex-start;
  }

  /* Collapsed: the lane shrinks to the chip's natural width and pins to the
     right edge over the 44px strip, so it stays aligned and never overhangs. */
  .toolbar-right--collapsed {
    flex: 0 0 auto;
    justify-content: flex-end;
  }

  .toolbar-right--collapsed :global(.storage-chip) {
    flex: 0 0 auto;
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

  /* Mobile right lane: the storage chip pinned to the right edge. It is the
     status zone and the entry to export / restore, replacing the old quick file
     actions (now in the app menu) (#2458). */
  .toolbar-right-mobile {
    flex: 0 0 auto;
    padding-right: max(var(--space-2), env(safe-area-inset-right, 0px));
    justify-content: flex-end;
  }

  /* Command pill: the button is the hit target, a true 44px-tall layout box
     (matching the gear and chevron, WCAG 2.5.5). The compact 32px visual pill
     lives on the inner .command-pill-visual span, so the clickable box is real,
     not an overflowed pseudo-element, and it never overlaps adjacent controls.
     The field fills the left region after the logo, with a margin before the
     tab strip, instead of sitting at a fixed width (#2398). */
  .command-pill {
    display: inline-flex;
    align-items: center;
    align-self: center;
    flex: 1 1 auto;
    min-width: 14rem;
    height: 44px;
    margin-right: var(--space-2);
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .command-pill-visual {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    transition:
      border-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  /* The hint label takes the slack so the shortcut badge stays pinned right and
     the field reads as a full-width search affordance. Truncates rather than
     wrapping if the region is narrow. */
  .command-pill-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-pill:hover .command-pill-visual {
    border-color: var(--colour-selection);
    color: var(--colour-text);
  }

  .command-pill:focus-visible {
    outline: none;
  }

  .command-pill:focus-visible .command-pill-visual {
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .command-pill--icon {
    flex: 0 0 auto;
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    min-width: var(--touch-target-min);
    margin-right: 0;
    padding: 0;
    justify-content: center;
  }

  .command-pill--icon .command-pill-visual {
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    justify-content: center;
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

  .command-pill-icon :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .command-pill-visual {
      transition: none;
    }
  }
</style>
