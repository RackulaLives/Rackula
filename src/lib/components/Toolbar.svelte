<!--
  Toolbar Component
  Geismar-minimal three-zone layout:
  - Left: Logo lockup (clickable for help)
  - Center: Action cluster (Undo, Redo, View, Fit, Export, Share)
  - Right: Dropdown menus (File, Settings)
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";
  import FileMenu from "./FileMenu.svelte";
  import SettingsMenu from "./SettingsMenu.svelte";
  import LogoLockup from "./LogoLockup.svelte";
  import SaveStatus from "./SaveStatus.svelte";
  import type { SaveStatus as SaveStatusType } from "$lib/utils/persistence-api";
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
    warnOnUnsavedChanges?: boolean;
    promptCleanupOnSave?: boolean;
    partyMode?: boolean;
    saveStatus?: SaveStatusType;
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    onimportdevices?: () => void;
    onimportnetbox?: () => void;
    onnewcustomdevice?: () => void;
    onfitall?: () => void;
    ontoggletheme?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
    ontogglebanana?: () => void;
    ontogglewarnunsaved?: () => void;
    ontogglepromptcleanup?: () => void;
    onopencleanup?: () => void;
    onhelp?: () => void;
  }

  let {
    hasRacks = false,
    theme = "dark",
    displayMode = "label",
    showAnnotations = false,
    showBanana = false,
    warnOnUnsavedChanges = true,
    promptCleanupOnSave = true,
    partyMode = false,
    saveStatus,
    onsave,
    onload,
    onexport,
    onshare,
    onimportdevices,
    onimportnetbox,
    onnewcustomdevice,
    onfitall,
    ontoggletheme,
    ontoggledisplaymode,
    ontoggleannotations,
    ontogglebanana,
    ontogglewarnunsaved,
    ontogglepromptcleanup,
    onopencleanup,
    onhelp,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

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
</script>

<header class="toolbar">
  <!-- Left: Logo -->
  <div class="toolbar-section toolbar-left">
    <Tooltip text="About & Shortcuts" shortcut="?" position="bottom">
      <button
        class="toolbar-brand"
        type="button"
        aria-label="About & Shortcuts"
        onclick={onhelp}
        data-testid="btn-logo-about"
      >
        <LogoLockup size={32} {partyMode} />
      </button>
    </Tooltip>
  </div>

  <!-- Center: Action cluster -->
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
      text="Display: {displayModeLabels[displayMode]}"
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

  <!-- Right: Dropdown menus -->
  <div class="toolbar-section toolbar-right">
    {#if saveStatus}
      <SaveStatus status={saveStatus} />
    {/if}

    <FileMenu
      onsave={handleSave}
      onload={handleLoad}
      onexport={handleExport}
      onshare={handleShare}
      onimportdevices={handleImportDevices}
      onimportnetbox={handleImportNetBox}
      onnewcustomdevice={handleNewCustomDevice}
      {hasRacks}
    />

    <SettingsMenu
      {theme}
      {showAnnotations}
      {showBanana}
      {warnOnUnsavedChanges}
      {promptCleanupOnSave}
      ontoggletheme={handleToggleTheme}
      ontoggleannotations={handleToggleAnnotations}
      ontogglebanana={handleToggleBanana}
      ontogglewarnunsaved={handleToggleWarnUnsaved}
      ontogglepromptcleanup={handleTogglePromptCleanup}
      onopencleanup={handleOpenCleanup}
    />
  </div>
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

  .toolbar-center {
    flex: 0 0 auto;
    gap: var(--space-2);
  }

  .toolbar-right {
    flex: 0 0 auto;
    gap: var(--space-2);
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

  /* Responsive: tighter gaps on narrow screens */
  @media (max-width: 600px) {
    .toolbar-center {
      gap: 0;
    }
  }
</style>
