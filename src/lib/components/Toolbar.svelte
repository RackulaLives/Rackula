<!--
  Toolbar Component
  Geismar-minimal three-zone layout:
  - Left: Logo lockup (clickable for help)
  - Center: Action cluster (Undo, Redo, View, Fit, Export, Share)
  - Right: Dropdown menus (desktop) / quick file actions (mobile)
-->
<script lang="ts">
  // @ts-nocheck
  import Tooltip from "./Tooltip.svelte";
  import FileMenu from "./FileMenu.svelte";
  import SettingsMenu from "./SettingsMenu.svelte";
  import LogoLockup from "./LogoLockup.svelte";
  import {
    IconUndoBold,
    IconRedoBold,
    IconTextBold,
    IconImageBold,
    IconFitAllBold,
    IconImageLabel,
    IconDownloadBold,
    IconShareBold,
  } from "./icons";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type { DisplayMode } from "$lib/types";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { analytics } from "$lib/utils/analytics";

  interface Props {
    hasRacks?: boolean;
    theme?: "dark" | "light";
    displayMode?: DisplayMode;
    showAnnotations?: boolean;
    showBanana?: boolean;
    compatibleOnly?: boolean;
    warnOnUnsavedChanges?: boolean;
    promptCleanupOnSave?: boolean;
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
    onfitall?: () => void;
    ontoggletheme?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
    ontogglebanana?: () => void;
    ontogglecompatibleonly?: () => void;
    ontogglewarnunsaved?: () => void;
    ontogglepromptcleanup?: () => void;
    onopencleanup?: () => void;
    onhelp?: () => void;
    onlayouts?: () => void;
  }

  let {
    hasRacks = false,
    theme = "dark",
    displayMode = "label",
    showAnnotations = false,
    showBanana = false,
    compatibleOnly = true,
    warnOnUnsavedChanges = true,
    promptCleanupOnSave = true,
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
    onfitall,
    ontoggletheme,
    ontoggledisplaymode,
    ontoggleannotations,
    ontogglebanana,
    ontogglecompatibleonly,
    ontogglewarnunsaved,
    ontogglepromptcleanup,
    onopencleanup,
    onhelp,
    onlayouts,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const viewportStore = getViewportStore();

  // Inline layout name editing state
  let isEditingName = $state(false);
  let editNameValue = $state("");

  // View mode labels for tooltip
  const displayModeLabels: Record<DisplayMode, string> = {
    label: "Labels",
    image: "Images",
    "image-label": "Both",
  };

  function handleUndo() {
    if (!layoutStore.canUndo) return;
    const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
    layoutStore.undo();
    toastStore.showToast(`Undid: ${desc}`, "info");
    analytics.trackToolbarClick("undo");
  }

  function handleRedo() {
    if (!layoutStore.canRedo) return;
    const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
    layoutStore.redo();
    toastStore.showToast(`Redid: ${desc}`, "info");
    analytics.trackToolbarClick("redo");
  }

  function handleSave() {
    analytics.trackToolbarClick("save");
    onsave?.();
  }

  function handleSaveAs() {
    analytics.trackToolbarClick("save-as");
    onsaveas?.();
  }

  function handleLoad() {
    analytics.trackToolbarClick("load");
    onload?.();
  }

  function handleExport() {
    analytics.trackToolbarClick("export");
    onexport?.();
  }

  function handleShare() {
    analytics.trackToolbarClick("share");
    onshare?.();
  }

  function handleViewYaml() {
    analytics.trackToolbarClick("view-yaml");
    onviewyaml?.();
  }

  function handleImportDevices() {
    analytics.trackToolbarClick("import-devices");
    onimportdevices?.();
  }

  function handleImportNetBox() {
    analytics.trackToolbarClick("import-netbox");
    onimportnetbox?.();
  }

  function handleNewCustomDevice() {
    analytics.trackToolbarClick("new-custom-device");
    onnewcustomdevice?.();
  }

  function handleLayouts() {
    analytics.trackToolbarClick("layouts");
    onlayouts?.();
  }

  function handleFitAll() {
    analytics.trackToolbarClick("fit-all");
    onfitall?.();
  }

  function handleToggleTheme() {
    analytics.trackToolbarClick("theme");
    ontoggletheme?.();
  }

  function handleToggleDisplayMode() {
    analytics.trackToolbarClick("display-mode");
    ontoggledisplaymode?.();
  }

  function handleToggleAnnotations() {
    analytics.trackToolbarClick("annotations");
    ontoggleannotations?.();
  }

  function handleToggleBanana() {
    analytics.trackToolbarClick("banana");
    ontogglebanana?.();
  }

  function handleToggleCompatibleOnly() {
    analytics.trackToolbarClick("compatible-only");
    ontogglecompatibleonly?.();
  }

  function handleToggleWarnUnsaved() {
    analytics.trackToolbarClick("warn-unsaved");
    ontogglewarnunsaved?.();
  }

  function handleTogglePromptCleanup() {
    analytics.trackToolbarClick("prompt-cleanup");
    ontogglepromptcleanup?.();
  }

  function handleOpenCleanup() {
    analytics.trackToolbarClick("open-cleanup");
    onopencleanup?.();
  }

  function handleHelp() {
    analytics.trackToolbarClick("help");
    onhelp?.();
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
  <!-- Left: Logo -->
  <div class="toolbar-section toolbar-left">
    <Tooltip text="About & Shortcuts" shortcut="?" position="bottom">
      <button
        class="toolbar-brand"
        type="button"
        aria-label="About & Shortcuts"
        onclick={handleHelp}
        data-testid="btn-logo-about"
      >
        <LogoLockup size={32} {partyMode} />
      </button>
    </Tooltip>
  </div>

  <!-- Layout name (desktop only) -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-name" data-testid="layout-name">
      {#if isEditingName}
        <input
          class="toolbar-name-input"
          type="text"
          bind:value={editNameValue}
          onkeydown={handleNameKeydown}
          onblur={() => isEditingName && commitName()}
          aria-label="Layout name"
          data-testid="layout-name-input"
          autofocus
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

  <!-- Center: Action cluster (desktop only) -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-center">
      <Tooltip
        text={layoutStore.undoDescription ?? "Undo"}
        shortcut="Ctrl+Z"
        position="bottom"
      >
        <button
          class="toolbar-icon-btn"
          aria-label={layoutStore.undoDescription ?? "Undo"}
          disabled={!layoutStore.canUndo}
          onclick={handleUndo}
          data-testid="btn-undo"
        >
          <IconUndoBold size={ICON_SIZE.md} />
        </button>
      </Tooltip>

      <Tooltip
        text={layoutStore.redoDescription ?? "Redo"}
        shortcut="Ctrl+Shift+Z"
        position="bottom"
      >
        <button
          class="toolbar-icon-btn"
          aria-label={layoutStore.redoDescription ?? "Redo"}
          disabled={!layoutStore.canRedo}
          onclick={handleRedo}
          data-testid="btn-redo"
        >
          <IconRedoBold size={ICON_SIZE.md} />
        </button>
      </Tooltip>

      <Tooltip
        text={`Display: ${displayModeLabels[displayMode]}`}
        shortcut="I"
        position="bottom"
      >
        <button
          class="toolbar-icon-btn"
          aria-label="Toggle display mode"
          onclick={handleToggleDisplayMode}
          data-testid="btn-display-mode"
        >
          {#if displayMode === "label"}
            <IconTextBold size={ICON_SIZE.md} />
          {:else if displayMode === "image"}
            <IconImageBold size={ICON_SIZE.md} />
          {:else}
            <IconImageLabel size={ICON_SIZE.lg} />
          {/if}
        </button>
      </Tooltip>

      <Tooltip text="Reset View" shortcut="F" position="bottom">
        <button
          class="toolbar-icon-btn"
          aria-label="Reset View"
          onclick={handleFitAll}
          data-testid="btn-fit-all"
        >
          <IconFitAllBold size={ICON_SIZE.md} />
        </button>
      </Tooltip>

      <Tooltip text="Export" shortcut="Ctrl+E" position="bottom">
        <button
          class="toolbar-icon-btn"
          aria-label="Export"
          disabled={!hasRacks}
          onclick={handleExport}
          data-testid="btn-export"
        >
          <IconDownloadBold size={ICON_SIZE.md} />
        </button>
      </Tooltip>

      <Tooltip text="Share" shortcut="Ctrl+H" position="bottom">
        <button
          class="toolbar-icon-btn"
          aria-label="Share"
          disabled={!hasRacks}
          onclick={handleShare}
          data-testid="btn-share"
        >
          <IconShareBold size={ICON_SIZE.md} />
        </button>
      </Tooltip>
    </div>
  {/if}

  <!-- Right: Dropdown menus (desktop) / quick file actions (mobile) -->
  {#if !viewportStore.isMobile}
    <div class="toolbar-section toolbar-right">
      <FileMenu
        onsave={handleSave}
        onsaveas={handleSaveAs}
        onload={handleLoad}
        onexport={handleExport}
        onshare={handleShare}
        onviewyaml={handleViewYaml}
        onimportdevices={handleImportDevices}
        onimportnetbox={handleImportNetBox}
        onnewcustomdevice={handleNewCustomDevice}
        onlayouts={onlayouts ? handleLayouts : undefined}
        {hasRacks}
      />

      <SettingsMenu
        {theme}
        {showAnnotations}
        {showBanana}
        {compatibleOnly}
        {warnOnUnsavedChanges}
        {promptCleanupOnSave}
        ontoggletheme={handleToggleTheme}
        ontoggleannotations={handleToggleAnnotations}
        ontogglebanana={handleToggleBanana}
        ontogglecompatibleonly={handleToggleCompatibleOnly}
        ontogglewarnunsaved={handleToggleWarnUnsaved}
        ontogglepromptcleanup={handleTogglePromptCleanup}
        onopencleanup={handleOpenCleanup}
      />
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
      {#if onlayouts}
        <button
          class="toolbar-mobile-action-btn"
          type="button"
          aria-label="Go to Layouts"
          onclick={handleLayouts}
          data-testid="btn-mobile-layouts"
        >
          Layouts
        </button>
      {/if}
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

  .toolbar-center {
    flex: 0 0 auto;
    gap: var(--space-2);
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

  /* Logo button */
  .toolbar-brand {
    display: flex;
    align-items: center;
    padding: var(--space-1);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  .toolbar-brand:hover {
    background: var(--colour-surface-hover);
  }

  .toolbar-brand:active {
    transform: scale(0.98);
  }

  .toolbar-brand:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  /* Icon buttons - shared by toolbar and dropdown triggers */
  .toolbar-icon-btn,
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
  .toolbar-icon-btn :global(svg),
  :global(.toolbar-icon-btn svg) {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
  }

  .toolbar-icon-btn:hover:not(:disabled),
  :global(.toolbar-icon-btn:hover:not(:disabled)) {
    color: var(--dracula-cyan);
    filter: brightness(1.1);
    box-shadow: inset 0 -2px 0 currentColor;
  }

  .toolbar-icon-btn:focus-visible,
  :global(.toolbar-icon-btn:focus-visible) {
    outline: none;
    color: var(--dracula-cyan);
    box-shadow:
      inset 0 -2px 0 currentColor,
      0 0 0 2px var(--colour-focus-ring);
  }

  .toolbar-icon-btn:disabled,
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

  /* Responsive: tighter gaps on narrow screens */
  @media (max-width: 600px) {
    .toolbar-center {
      gap: 0;
    }
  }
</style>
