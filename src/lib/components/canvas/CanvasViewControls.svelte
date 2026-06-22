<!--
  CanvasViewControls Component
  Bottom-left canvas cluster holding the view and history controls in two
  visually separated groups: History (undo, redo) and View (zoom out, zoom
  readout, zoom in, fit, display-mode lens).

  This surfaces existing handlers; it does not own view or history logic. The
  display-mode lens here is the canonical layout-scoped control; the side panel
  View tab and the palette toggle mirror the same state.
-->
<script lang="ts">
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { DISPLAY_MODE_LABELS, type DisplayMode } from "$lib/types";
  import Tooltip from "../Tooltip.svelte";
  import {
    IconFitAllBold,
    IconImageBold,
    IconImageLabel,
    IconMinusBold,
    IconPlusBold,
    IconRedoBold,
    IconTextBold,
    IconUndoBold,
  } from "../icons";

  interface Props {
    displayMode: DisplayMode;
    onfitall?: () => void;
    ontoggledisplaymode?: () => void;
  }

  let { displayMode, onfitall, ontoggledisplaymode }: Props = $props();

  const canvasStore = getCanvasStore();
  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  function handleUndo() {
    if (!layoutStore.canUndo) return;
    const desc = layoutStore.undoDescription?.replace("Undo: ", "") ?? "action";
    layoutStore.undo();
    toastStore.showToast(`Undid: ${desc}`, "info");
  }

  function handleRedo() {
    if (!layoutStore.canRedo) return;
    const desc = layoutStore.redoDescription?.replace("Redo: ", "") ?? "action";
    layoutStore.redo();
    toastStore.showToast(`Redid: ${desc}`, "info");
  }
</script>

<div class="canvas-view-controls">
  <div class="control-group" role="group" aria-label="History actions">
    <Tooltip
      text={layoutStore.undoDescription ?? "Undo"}
      shortcut="Ctrl+Z"
      position="top"
    >
      {#snippet triggerChild({ props })}
        <button
          {...props}
          class="control-button"
          type="button"
          aria-label={layoutStore.undoDescription ?? "Undo"}
          aria-disabled={!layoutStore.canUndo}
          onclick={handleUndo}
          data-testid="btn-undo"
        >
          <IconUndoBold size={ICON_SIZE.md} />
        </button>
      {/snippet}
    </Tooltip>

    <Tooltip
      text={layoutStore.redoDescription ?? "Redo"}
      shortcut="Ctrl+Shift+Z"
      position="top"
    >
      {#snippet triggerChild({ props })}
        <button
          {...props}
          class="control-button"
          type="button"
          aria-label={layoutStore.redoDescription ?? "Redo"}
          aria-disabled={!layoutStore.canRedo}
          onclick={handleRedo}
          data-testid="btn-redo"
        >
          <IconRedoBold size={ICON_SIZE.md} />
        </button>
      {/snippet}
    </Tooltip>
  </div>

  <div class="control-group" role="group" aria-label="View actions">
    <Tooltip text="Zoom out" position="top">
      {#snippet triggerChild({ props })}
        <button
          {...props}
          class="control-button"
          type="button"
          aria-label="Zoom out"
          aria-disabled={!canvasStore.canZoomOut}
          onclick={() => canvasStore.zoomOut()}
          data-testid="btn-zoom-out"
        >
          <IconMinusBold size={ICON_SIZE.md} />
        </button>
      {/snippet}
    </Tooltip>

    <span
      class="zoom-readout"
      role="status"
      aria-live="polite"
      aria-label={`Zoom level ${canvasStore.zoomPercentage} percent`}
      data-testid="zoom-readout"
    >
      {canvasStore.zoomPercentage}%
    </span>

    <Tooltip text="Zoom in" position="top">
      {#snippet triggerChild({ props })}
        <button
          {...props}
          class="control-button"
          type="button"
          aria-label="Zoom in"
          aria-disabled={!canvasStore.canZoomIn}
          onclick={() => canvasStore.zoomIn()}
          data-testid="btn-zoom-in"
        >
          <IconPlusBold size={ICON_SIZE.md} />
        </button>
      {/snippet}
    </Tooltip>

    <Tooltip text="Fit all" shortcut="F" position="top">
      {#snippet triggerChild({ props })}
        <button
          {...props}
          class="control-button"
          type="button"
          aria-label="Fit all"
          onclick={() => onfitall?.()}
          data-testid="btn-fit-all"
        >
          <IconFitAllBold size={ICON_SIZE.md} />
        </button>
      {/snippet}
    </Tooltip>

    <Tooltip
      text={`Display: ${DISPLAY_MODE_LABELS[displayMode]}`}
      shortcut="I"
      position="top"
    >
      {#snippet triggerChild({ props })}
        <button
          {...props}
          class="control-button"
          type="button"
          aria-label="Toggle display mode"
          onclick={() => ontoggledisplaymode?.()}
          data-testid="btn-display-mode"
        >
          {#if displayMode === "label"}
            <IconTextBold size={ICON_SIZE.md} />
          {:else if displayMode === "image"}
            <IconImageBold size={ICON_SIZE.md} />
          {:else}
            <IconImageLabel size={ICON_SIZE.md} />
          {/if}
        </button>
      {/snippet}
    </Tooltip>
  </div>
</div>

<style>
  .canvas-view-controls {
    position: absolute;
    bottom: max(var(--space-3), env(safe-area-inset-bottom, 0px));
    left: max(var(--space-3), env(safe-area-inset-left, 0px));
    z-index: calc(var(--z-toolbar) + 1);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    pointer-events: none;
  }

  .control-group {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-full);
    border: 1px solid var(--bottom-nav-border);
    background: var(--bottom-nav-bg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--shadow-sm);
  }

  .control-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .control-button:hover:not([aria-disabled="true"]) {
    background: var(--colour-overlay-hover);
    color: var(--colour-primary);
  }

  .control-button:active:not([aria-disabled="true"]) {
    transform: scale(0.97);
  }

  .control-button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-glow);
    color: var(--colour-primary);
  }

  /* aria-disabled (not native disabled) keeps the control focusable and
     hoverable so its tooltip and shortcut hint stay reachable while the action
     is unavailable; the click/keyboard handlers and zoom store guard against
     acting (#2255). */
  .control-button[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .zoom-readout {
    min-width: 3.5ch;
    padding: 0 var(--space-1);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    text-align: center;
    user-select: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .control-button {
      transition: none;
    }
  }
</style>
