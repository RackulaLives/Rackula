<!--
  Toolbar Component
  Minimalist toolbar with hamburger menu and essential actions.
  Inspired by Beszel and Gesimar design principles.
-->
<script lang="ts">
  import Tooltip from "./Tooltip.svelte";
  import ToolbarMenu from "./ToolbarMenu.svelte";
  import LogoLockup from "./LogoLockup.svelte";
  import { IconPlus, IconUndo, IconRedo } from "./icons";
  import type { DisplayMode } from "$lib/types";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { analytics } from "$lib/utils/analytics";

  interface Props {
    hasSelection?: boolean;
    hasRacks?: boolean;
    theme?: "dark" | "light";
    displayMode?: DisplayMode;
    showAnnotations?: boolean;
    partyMode?: boolean;
    onnewrack?: () => void;
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    ondelete?: () => void;
    onfitall?: () => void;
    ontoggletheme?: () => void;
    ontoggledisplaymode?: () => void;
    ontoggleannotations?: () => void;
    onhelp?: () => void;
  }

  let {
    hasSelection = false,
    hasRacks = false,
    theme = "dark",
    displayMode = "label",
    showAnnotations = false,
    partyMode = false,
    onnewrack,
    onsave,
    onload,
    onexport,
    onshare,
    ondelete,
    onfitall,
    ontoggletheme,
    ontoggledisplaymode,
    ontoggleannotations,
    onhelp,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

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

  function handleNewRack() {
    analytics.trackRackCreate();
    analytics.trackToolbarClick("new-rack");
    onnewrack?.();
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

  function handleDelete() {
    analytics.trackToolbarClick("delete");
    ondelete?.();
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
</script>

<header class="toolbar">
  <!-- Left section: Logo, New Rack, Menu -->
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

    <Tooltip text="New Rack" position="bottom">
      <button
        class="btn-new-rack"
        aria-label="New Rack"
        onclick={handleNewRack}
        data-testid="btn-new-rack"
      >
        <IconPlus size={14} />
        <span>New Rack</span>
      </button>
    </Tooltip>

    <ToolbarMenu
      onsave={handleSave}
      onload={handleLoad}
      onexport={handleExport}
      onshare={handleShare}
      {hasRacks}
      onundo={handleUndo}
      onredo={handleRedo}
      ondelete={handleDelete}
      canUndo={layoutStore.canUndo}
      canRedo={layoutStore.canRedo}
      {hasSelection}
      undoDescription={layoutStore.undoDescription}
      redoDescription={layoutStore.redoDescription}
      onfitall={handleFitAll}
      ontoggledisplaymode={handleToggleDisplayMode}
      ontoggleannotations={handleToggleAnnotations}
      ontoggletheme={handleToggleTheme}
      {displayMode}
      {showAnnotations}
      {theme}
    />
  </div>

  <!-- Spacer -->
  <div class="toolbar-spacer"></div>

  <!-- Right section: Undo/Redo -->
  <div class="toolbar-section toolbar-right">
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
        <IconUndo size={18} />
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
        <IconRedo size={18} />
      </button>
    </Tooltip>
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
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

  .toolbar-spacer {
    flex: 1;
  }

  .toolbar-right {
    flex: 0 0 auto;
    gap: var(--space-1);
  }

  /* Logo button - minimal, clickable */
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

  /* New Rack button - Beszel-inspired outline style */
  .btn-new-rack {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-primary);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .btn-new-rack:hover {
    background: var(--colour-primary);
    color: var(--colour-text-on-primary);
  }

  .btn-new-rack:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-primary);
  }

  .btn-new-rack:active {
    transform: scale(0.98);
  }

  /* Icon-only buttons - borderless, monochrome */
  .toolbar-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .toolbar-icon-btn:hover:not(:disabled) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .toolbar-icon-btn:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .toolbar-icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Responsive: Hide text on narrow screens */
  @media (max-width: 600px) {
    .btn-new-rack span {
      display: none;
    }

    .btn-new-rack {
      padding: var(--space-2);
    }
  }
</style>
