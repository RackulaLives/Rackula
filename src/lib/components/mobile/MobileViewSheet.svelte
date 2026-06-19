<!--
  MobileViewSheet Component
  Mobile bottom sheet controls for display mode, annotations, a read-only lock,
  and zoom. The zoom stepper reads the shared canvas store directly (the same
  verbs the desktop CanvasViewControls cluster uses) so mobile does not fork zoom
  logic, and the read-only lock drives the shared UI store.
-->
<script lang="ts">
  import type { DisplayMode } from "$lib/types";
  import SegmentedControl from "$lib/components/SegmentedControl.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import {
    IconMinusBold,
    IconPlusBold,
    IconFitAllBold,
  } from "$lib/components/icons";

  interface Props {
    displayMode: DisplayMode;
    showAnnotations: boolean;
    ondisplaymodechange?: (mode: DisplayMode) => void;
    onannotationschange?: (enabled: boolean) => void;
    onfitall?: () => void;
    onresetzoom?: () => void;
    onclose?: () => void;
  }

  let {
    displayMode,
    showAnnotations,
    ondisplaymodechange,
    onannotationschange,
    onfitall,
    onresetzoom,
    onclose,
  }: Props = $props();

  const canvasStore = getCanvasStore();
  const uiStore = getUIStore();

  const displayModeOptions: Array<{ value: DisplayMode; label: string }> = [
    { value: "label", label: "Label" },
    { value: "image", label: "Image" },
    { value: "image-label", label: "Image + Label" },
  ];

  function handleDisplayModeChange(mode: DisplayMode) {
    ondisplaymodechange?.(mode);
  }

  function handleAnnotationsChange(enabled: boolean) {
    onannotationschange?.(enabled);
  }

  function handleReadOnlyChange(locked: boolean) {
    uiStore.setReadOnly(locked);
  }

  function handleFitAll() {
    onfitall?.();
    onclose?.();
  }

  function handleResetZoom() {
    onresetzoom?.();
    onclose?.();
  }
</script>

<div class="mobile-view-sheet">
  <section class="section">
    <h3 class="section-title">Display Mode</h3>
    <SegmentedControl
      options={displayModeOptions}
      value={displayMode}
      onchange={handleDisplayModeChange}
      ariaLabel="Display mode"
    />
  </section>

  <section class="section">
    <Switch
      id="mobile-view-annotations"
      checked={showAnnotations}
      label="Annotations"
      onchange={handleAnnotationsChange}
    />
  </section>

  <section class="section">
    <Switch
      id="mobile-view-readonly"
      checked={uiStore.readOnly}
      label="Read-only"
      helperText="Lock the layout for viewing"
      onchange={handleReadOnlyChange}
    />
  </section>

  <div class="divider" role="separator" aria-hidden="true"></div>

  <section class="section">
    <h3 class="section-title">Zoom</h3>
    <div class="zoom-row" role="group" aria-label="Zoom controls">
      <button
        type="button"
        class="zoom-step"
        aria-label="Zoom out"
        disabled={!canvasStore.canZoomOut}
        onclick={() => canvasStore.zoomOut()}
      >
        <IconMinusBold size={ICON_SIZE.md} />
      </button>
      <span
        class="zoom-readout"
        role="status"
        aria-live="polite"
        aria-label={`Zoom level ${canvasStore.zoomPercentage} percent`}
      >
        {canvasStore.zoomPercentage}%
      </span>
      <button
        type="button"
        class="zoom-step"
        aria-label="Zoom in"
        disabled={!canvasStore.canZoomIn}
        onclick={() => canvasStore.zoomIn()}
      >
        <IconPlusBold size={ICON_SIZE.md} />
      </button>
    </div>
    <button
      type="button"
      class="action-button fit-button"
      onclick={handleFitAll}
    >
      <IconFitAllBold size={ICON_SIZE.sm} />
      Fit to screen
    </button>
  </section>

  <button type="button" class="reset-link" onclick={handleResetZoom}>
    Reset zoom
  </button>
</div>

<style>
  .mobile-view-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-1) var(--space-4);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .divider {
    height: 1px;
    background: var(--colour-border);
  }

  .zoom-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
  }

  .zoom-step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--colour-text);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .zoom-step:hover:not(:disabled) {
    background: var(--colour-surface-hover);
  }

  .zoom-step:active:not(:disabled) {
    scale: 0.97;
  }

  .zoom-step:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .zoom-step:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .zoom-readout {
    flex: 1;
    text-align: center;
    color: var(--colour-text);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .action-button:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-text-muted);
  }

  .action-button:active {
    background: var(--colour-surface-hover);
    scale: 0.98;
  }

  .action-button:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .reset-link {
    align-self: center;
    min-height: var(--touch-target-min);
    padding: var(--space-1) var(--space-3);
    border: none;
    background: transparent;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .reset-link:hover {
    color: var(--colour-text);
  }

  .reset-link:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
</style>
