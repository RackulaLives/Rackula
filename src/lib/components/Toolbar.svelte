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
  The lane widths are held at the expanded column widths in both states, so
  collapsing a side panel never moves or resizes the search field or the tab
  strip (#2583).
-->
<script lang="ts">
  import AppMenu from "./AppMenu.svelte";
  import StorageStatusChip from "./StorageStatusChip.svelte";
  import LayoutTabs from "./LayoutTabs.svelte";
  import type { ActionId } from "$lib/actions/registry";
  import { IconSearch, IconMenuBold } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatShortcut } from "$lib/utils/platform";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { handleExportAll } from "$lib/storage";
  import { runRestoreFromFile } from "$lib/actions/restore-file-trigger";

  interface Props {
    hasRacks?: boolean;
    partyMode?: boolean;
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
    "export-all": () => {
      void handleExportAll();
    },
    "restore-file": () => runRestoreFromFile(),
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

  // Mirrors the desktop dropdown's open-state on mobile so the hamburger reports
  // aria-expanded correctly. The sheet itself lives in DialogOrchestrator.
  const menuSheetOpen = $derived(dialogStore.isSheetOpen("menu"));

  // Focus the trigger before opening so bits-ui captures it as the element to
  // restore focus to when the sheet closes. Touch taps do not move keyboard
  // focus on mobile by default, the same gap MobileBottomNav's handleTabClick
  // handles for the bottom-nav buttons.
  function handleMenuTriggerClick(event: MouseEvent) {
    (event.currentTarget as HTMLElement).focus();
    dialogStore.openSheet("menu");
  }
</script>

<header class="toolbar">
  <!-- Left: app menu + command palette pill. On desktop the logo lockup is the
       app-menu dropdown trigger; on mobile a hamburger button opens the same
       menu as a bottom sheet, since a dropdown is awkward on touch (#2597).
       Width = --sidebar-width so it aligns with the column below; held constant
       across sidebar collapse so the pill never moves or resizes (#2583). -->
  <div
    class="toolbar-section toolbar-left"
    class:toolbar-left--mobile={viewportStore.isMobile}
  >
    {#if viewportStore.isMobile}
      <button
        class="menu-trigger"
        type="button"
        aria-label="App menu"
        aria-haspopup="dialog"
        aria-expanded={menuSheetOpen}
        data-testid="btn-app-menu-mobile"
        onclick={handleMenuTriggerClick}
      >
        <IconMenuBold size={ICON_SIZE.md} />
      </button>
    {:else}
      <AppMenu onaction={handleAppMenuAction} {hasRacks} {partyMode} />
    {/if}
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
          <span class="command-pill-text">Search</span>
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
       and the side-panel collapse/expand chevron lives in the panel (#2397).
       Width = --side-panel-width, held constant across panel collapse so the
       tab strip never moves (#2583). -->
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

  /* Left lane: fixed to the sidebar column width. Left padding gives the logo
     ~8px from the edge. The width is held at the expanded column width in both
     states so the search pill and the centre tab strip keep a constant size and
     position regardless of whether the sidebar is collapsed (#2583). */
  .toolbar-left {
    flex: 0 0 var(--sidebar-width, 320px);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    min-width: 0;
  }

  /* Mobile left lane: there is no column to align with, so the lane shrinks to
     its natural width (logo + compact search icon). This lets the centred layout
     name actually centre between the left and right zones (#2458). */
  .toolbar-left--mobile {
    flex: 0 0 auto;
    padding-left: max(var(--space-2), env(safe-area-inset-left, 0px));
  }

  /* Centre lane: fills the canvas gap between left and right fixed lanes. The
     left margin keeps the first tab clear of the search pill so the two do not
     crowd at the lane boundary; it pairs with the pill's own margin-right. */
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

  /* Mobile right lane: the storage chip pinned to the right edge. It is the
     status zone and the entry to export / restore, replacing the old quick file
     actions (now in the app menu) (#2458). */
  .toolbar-right-mobile {
    flex: 0 0 auto;
    padding-right: max(var(--space-2), env(safe-area-inset-right, 0px));
    justify-content: flex-end;
  }

  /* Mobile app-menu trigger: a hamburger button that opens the menu sheet. A
     true 44px square hit area (WCAG 2.5.5) matching the compact search button
     beside it, so the mobile left group reads as two equal icon buttons. */
  .menu-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    min-width: var(--touch-target-min);
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .menu-trigger:hover {
    background: var(--colour-surface-hover);
  }

  .menu-trigger:active {
    transform: scale(0.96);
  }

  .menu-trigger:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-trigger {
      transition: none;
    }

    .menu-trigger:active {
      transform: none;
    }
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

  .command-pill-icon {
    display: inline-flex;
    align-items: center;
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
