<!--
  Toolbar Component
  Workspace frame only (issue #2072): the top bar carries app/workspace chrome,
  not view, history, or object controls.
  - Left: Logo lockup (the app menu)
  - Centre: Layout name (workspace identity, desktop)
  - Right: Storage chip + Settings gear (desktop) / quick file actions (mobile)
  View and history controls (zoom, fit, display mode, undo, redo) relocate to the
  canvas bottom-left in #2074; they stay reachable today via the keyboard and the
  Devices sidebar. File commands (save, load, export, share, import) live in the
  app menu behind the logo.
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";
  import AppMenu from "./AppMenu.svelte";
  import StorageStatusChip from "./StorageStatusChip.svelte";
  import type { ActionId } from "$lib/actions/registry";
  import { IconGearBold, IconSearch } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { formatShortcut } from "$lib/utils/platform";
  import { dialogStore } from "$lib/stores/dialogs.svelte";

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
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const viewportStore = getViewportStore();
  const paletteShortcut = formatShortcut("mod", "K");

  // Inline layout name editing state
  let isEditingName = $state(false);
  let editNameValue = $state("");
  let nameInputElement = $state<HTMLInputElement | null>(null);

  // Focus the rename input when it appears (replaces autofocus attribute)
  $effect(() => {
    if (!isEditingName) return;
    const frame = requestAnimationFrame(() => {
      nameInputElement?.focus();
      nameInputElement?.select();
    });
    return () => cancelAnimationFrame(frame);
  });

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

  function startEditingName() {
    editNameValue = layoutStore.layout.name;
    isEditingName = true;
  }

  function commitName() {
    layoutStore.setLayoutName(editNameValue);
    isEditingName = false;
  }

  function cancelEditingName() {
    isEditingName = false;
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditingName();
    }
  }
</script>

<header class="toolbar">
  <!-- Left: Logo (also the app menu) + command palette pill -->
  <div class="toolbar-section toolbar-left">
    <AppMenu onaction={handleAppMenuAction} {hasRacks} {partyMode} />
    <button
      class="command-pill"
      class:command-pill--icon={viewportStore.isMobile}
      type="button"
      aria-label="Search or jump to a command"
      onclick={() => dialogStore.open("commandPalette")}
      data-testid="btn-command-palette"
    >
      <span class="command-pill-icon" aria-hidden="true"
        ><IconSearch size={ICON_SIZE.sm} /></span
      >
      {#if !viewportStore.isMobile}
        <span class="command-pill-text">Search or jump to...</span>
        <span class="command-pill-badge">{paletteShortcut}</span>
      {/if}
    </button>
  </div>

  <!-- Layout name (desktop only) -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-name" data-testid="layout-name">
      {#if isEditingName}
        <input
          bind:this={nameInputElement}
          class="toolbar-name-input"
          type="text"
          bind:value={editNameValue}
          onkeydown={handleNameKeydown}
          onblur={() => isEditingName && commitName()}
          aria-label="Layout name"
          data-testid="layout-name-input"
        />
      {:else}
        <button
          class="toolbar-name-display"
          type="button"
          onclick={startEditingName}
          aria-label="Rename layout"
          title="Click to rename"
          data-testid="layout-name-display"
        >
          <span class="toolbar-name-text">{layoutStore.layout.name}</span>
          <svg
            class="toolbar-name-pencil"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Right: Workspace chrome (desktop) / quick file actions (mobile) -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-right">
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
    padding: 0 var(--space-4);
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
  }

  .toolbar-left {
    flex: 0 0 auto;
  }

  .toolbar-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-start;
    padding: 0 var(--space-3);
  }

  .toolbar-name-display {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }

  .toolbar-name-display:hover {
    border-color: var(--colour-border);
    background: var(--colour-surface-hover);
  }

  .toolbar-name-display:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .toolbar-name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar-name-pencil {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .toolbar-name-display:hover .toolbar-name-pencil {
    opacity: 0.6;
  }

  .toolbar-name-input {
    width: 100%;
    max-width: 300px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--dracula-cyan);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    font-family: inherit;
    outline: none;
  }

  .toolbar-right {
    flex: 0 0 auto;
    gap: var(--space-2);
  }

  .toolbar-right:not(.toolbar-right-mobile) {
    margin-left: var(--space-2);
  }

  .toolbar-right-mobile {
    gap: var(--space-1);
  }

  /* Icon buttons - the dropdown-menu triggers (Settings gear) use this class. */
  :global(.toolbar-icon-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
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

  .command-pill {
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
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .command-pill:hover {
    border-color: var(--colour-selection);
    color: var(--colour-text);
  }

  .command-pill:focus-visible {
    outline: none;
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
    .command-pill {
      transition: none;
    }
  }
</style>
