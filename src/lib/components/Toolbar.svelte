<!--
  Toolbar Component
  Workspace frame, three column-aligned regions (issues #2072, #2324, #2386):
  - Left (fixed, = sidebar width): logo lockup (the app menu) + command-palette
    search pill. Width tracks --sidebar-width so it aligns with the column below.
  - Centre (flex): the layout tab strip (LayoutTabs), desktop only. Spans the
    canvas gap between the sidebar and side panel.
  - Right (fixed, = panel width): storage chip + Settings gear (desktop); quick
    file actions (mobile). Width tracks --side-panel-width. The side-panel
    collapse/expand chevron lives in the panel itself (#2397).
  View and history controls (zoom, fit, display mode, undo, redo) relocate to the
  canvas bottom-left in #2074. File commands live in the app menu behind the logo.
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";
  import AppMenu from "./AppMenu.svelte";
  import StorageStatusChip from "./StorageStatusChip.svelte";
  import LayoutTabs from "./LayoutTabs.svelte";
  import type { ActionId } from "$lib/actions/registry";
  import { IconGearBold, IconSearch } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
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
  const paletteShortcut = formatShortcut("mod", "K");

  function handleSave() {
    onsave?.();
  }

  function handleLoad() {
    onload?.();
  }

  function handleExport() {
    onexport?.();
  }

  function handleSettings() {
    onsettings?.();
  }

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

  <!-- Centre: the layout tab strip (desktop only).
       flex: 1 spans the canvas gap between the sidebar and side panel. -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-tabs">
      <LayoutTabs onexport={onlayoutexport} />
    </div>
  {/if}

  <!-- Right: panel-width region (desktop) / quick file actions (mobile).
       Holds storage chip + Settings gear. The side-panel collapse/expand
       chevron now lives in the panel itself (#2397). -->
  {#if !viewportStore.isMobile}
    <div
      class="toolbar-section toolbar-right"
      class:toolbar-right--collapsed={sidePanelCollapsed}
    >
      <StorageStatusChip />

      <Tooltip text="Settings" position="bottom">
        <button
          class="toolbar-icon-btn"
          type="button"
          aria-label="Settings"
          onclick={handleSettings}
          data-testid="btn-settings"
        >
          <IconGearBold size={ICON_SIZE.md} />
        </button>
      </Tooltip>
    </div>
  {:else}
    <div
      class="toolbar-section toolbar-right toolbar-right-mobile"
      role="group"
      aria-label="Quick file actions"
    >
      <button
        class="toolbar-mobile-action-btn"
        type="button"
        aria-label="Save layout"
        onclick={handleSave}
        data-testid="btn-mobile-save"
      >
        Save
      </button>
      <button
        class="toolbar-mobile-action-btn"
        type="button"
        aria-label="Load layout"
        onclick={handleLoad}
        data-testid="btn-mobile-load"
      >
        Load
      </button>
      <button
        class="toolbar-mobile-action-btn"
        type="button"
        aria-label="Export layout"
        disabled={!hasRacks}
        onclick={handleExport}
        data-testid="btn-mobile-export"
      >
        Export
      </button>
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

  /* Centre lane: fills the canvas gap between left and right fixed lanes. */
  .toolbar-tabs {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-start;
  }

  /* Right lane: fixed to side-panel width so it aligns with the panel column.
     Shrinks to its natural width (pinned to the right edge) when the panel is
     collapsed to its 44px strip, so controls never overhang it (#2397). */
  .toolbar-right {
    flex: 0 0 var(--side-panel-width, 320px);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .toolbar-right--collapsed {
    flex: 0 0 auto;
  }

  .toolbar-right-mobile {
    gap: var(--space-1);
    flex: 0 0 auto;
    padding-right: var(--space-2);
  }

  /* Icon buttons - the dropdown-menu triggers (Settings gear) use this class. */
  :global(.toolbar-icon-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* 44px hit area; visual footprint is set by icon size */
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  /* Icon sizing via CSS tokens */
  :global(.toolbar-icon-btn svg) {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
  }

  :global(.toolbar-icon-btn:hover:not(:disabled)) {
    color: var(--dracula-cyan);
    filter: brightness(1.1);
    box-shadow: inset 0 -2px 0 currentColor;
  }

  :global(.toolbar-icon-btn:focus-visible) {
    outline: none;
    color: var(--dracula-cyan);
    box-shadow:
      inset 0 -2px 0 currentColor,
      0 0 0 2px var(--colour-focus-ring);
  }

  :global(.toolbar-icon-btn:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.toolbar-icon-btn[data-state="open"]) {
    color: var(--dracula-cyan);
    box-shadow: inset 0 -2px 0 currentColor;
  }

  .toolbar-mobile-action-btn {
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .toolbar-mobile-action-btn:hover:not(:disabled) {
      color: var(--dracula-cyan);
      background: var(--colour-surface-hover);
    }
  }

  .toolbar-mobile-action-btn:focus-visible {
    outline: none;
    color: var(--dracula-cyan);
    box-shadow: 0 0 0 2px var(--colour-focus-ring);
  }

  .toolbar-mobile-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Command pill: the button is the hit target, a true 44px-tall layout box
     (matching the gear and chevron, WCAG 2.5.5). The compact 32px visual pill
     lives on the inner .command-pill-visual span, so the clickable box is real,
     not an overflowed pseudo-element, and it never overlaps adjacent controls. */
  .command-pill {
    display: inline-flex;
    align-items: center;
    align-self: center;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .command-pill-visual {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
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
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    min-width: var(--touch-target-min);
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
