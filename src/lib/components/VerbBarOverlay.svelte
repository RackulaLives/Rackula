<!--
  VerbBarOverlay (#2075)

  The canvas-side host for the floating verb bar. It owns everything VerbBar
  deliberately does not: reading the selection, building the action context,
  measuring the selected object's screen geometry, positioning the bar in
  screen space, and dispatching verbs to the shared selection-action handlers.

  It mounts as a screen-space sibling of the panzoom-transformed container so
  its coordinates are viewport pixels (position: fixed), unaffected by the
  canvas transform. VerbBar stays presentation-only.
-->
<script lang="ts">
  import VerbBar from "./VerbBar.svelte";
  import { getVerbsForSelection } from "$lib/actions/verb-bars";
  import {
    computeVerbBarPosition,
    VERB_BAR_LOW_ZOOM_THRESHOLD,
    type VerbBarPosition,
  } from "$lib/utils/verb-bar-position";
  import type { ActionEnabledContext, ActionId } from "$lib/actions/registry";
  import {
    moveSelectedDeviceUp,
    moveSelectedDeviceDown,
    moveSelectedDeviceToSlot,
    canMoveSelectedDeviceSlot,
    flipSelectedDeviceFace,
    duplicateSelection,
  } from "$lib/actions/selection-actions";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getStorageMode } from "$lib/storage";

  interface Props {
    /** Screen-space canvas container the overlay measures and positions within. */
    canvasEl: HTMLElement | null;
    /** Delete the current selection (device or rack). */
    ondelete?: () => void;
    /** Focus the given racks (rack verb). */
    onrackfocus?: (rackIds: string[]) => void;
    /** Export the given racks (rack verb). */
    onrackexport?: (rackIds: string[]) => void;
  }

  let { canvasEl, ondelete, onrackfocus, onrackexport }: Props = $props();

  const selection = getSelectionStore();
  const layout = getLayoutStore();
  const canvas = getCanvasStore();
  const ui = getUIStore();

  const ctx = $derived<ActionEnabledContext>({
    hasSelection: selection.hasSelection,
    isDeviceSelected: selection.isDeviceSelected,
    isRackSelected: selection.isRackSelected,
    canUndo: layout.canUndo,
    canRedo: layout.canRedo,
    hasRacks: layout.rackCount > 0,
    mode: getStorageMode(),
    canMoveDeviceSlot: canMoveSelectedDeviceSlot(),
    readOnly: ui.readOnly,
  });

  const verbs = $derived(
    getVerbsForSelection(ctx).map((a) => ({ id: a.id, label: a.label })),
  );

  const ariaLabel = $derived(
    selection.isDeviceSelected ? "Device actions" : "Rack actions",
  );

  let barEl = $state<HTMLDivElement | null>(null);
  let pos = $state<VerbBarPosition>({
    visible: false,
    left: 0,
    top: 0,
    placement: "above",
  });

  function dispatch(id: ActionId): void {
    switch (id) {
      case "move-device-up":
        moveSelectedDeviceUp();
        break;
      case "move-device-down":
        moveSelectedDeviceDown();
        break;
      case "move-device-slot":
        moveSelectedDeviceToSlot();
        break;
      case "flip-device-face":
        flipSelectedDeviceFace();
        break;
      case "duplicate-selection":
        duplicateSelection();
        break;
      case "delete-selection":
        ondelete?.();
        break;
      case "focus-rack":
        if (selection.selectedRackId) onrackfocus?.([selection.selectedRackId]);
        break;
      case "export-rack":
        if (selection.selectedRackId)
          onrackexport?.([selection.selectedRackId]);
        break;
    }
  }

  /** Resolve the DOM node the bar points at. */
  function findTarget(): Element | null {
    if (!canvasEl) return null;

    if (selection.isDeviceSelected && selection.selectedDeviceId) {
      return canvasEl.querySelector(
        `[data-device-uuid="${CSS.escape(selection.selectedDeviceId)}"]`,
      );
    }

    if (selection.isRackSelected && selection.selectedRackId) {
      return canvasEl.querySelector(
        `[data-rack-id="${CSS.escape(selection.selectedRackId)}"]`,
      );
    }

    return null;
  }

  function hide(): void {
    if (pos.visible) pos = { ...pos, visible: false };
  }

  function measure(): void {
    if (!barEl || verbs.length === 0) return hide();
    // The bar is hidden below this zoom anyway; skip the selector and layout
    // reads while zoomed out (the rAF loop calls this every frame).
    if (canvas.zoom < VERB_BAR_LOW_ZOOM_THRESHOLD) return hide();

    const target = findTarget();
    if (!target) return hide();

    const barRect = barEl.getBoundingClientRect();
    const next = computeVerbBarPosition({
      target: target.getBoundingClientRect(),
      bar: { width: barRect.width, height: barRect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scale: canvas.zoom,
    });

    if (
      next.visible !== pos.visible ||
      next.left !== pos.left ||
      next.top !== pos.top
    ) {
      pos = next;
    }
  }

  // Keep the bar pinned to the selected object. Pan has no reactive signal in
  // the canvas store, so a requestAnimationFrame loop (running only while a bar
  // is shown) tracks pan and zoom; a target or verb-set change re-runs this
  // effect. measure() skips state writes when nothing moved, so an idle
  // selection costs only a couple of getBoundingClientRect reads per frame and
  // triggers no re-render.
  $effect(() => {
    void selection.selectedDeviceId;
    void selection.selectedRackId;
    void verbs;
    if (verbs.length === 0) return;

    let raf = 0;
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onReflow = () => measure();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  });
</script>

{#if verbs.length > 0}
  <div
    bind:this={barEl}
    class="verb-bar-overlay"
    class:hidden={!pos.visible}
    style:left="{pos.left}px"
    style:top="{pos.top}px"
  >
    <VerbBar
      {verbs}
      {ariaLabel}
      ondispatch={dispatch}
      interacting={canvas.isInteracting}
    />
  </div>
{/if}

<style>
  .verb-bar-overlay {
    position: fixed;
    z-index: var(--z-verb-bar, 50);
  }

  .verb-bar-overlay.hidden {
    visibility: hidden;
    pointer-events: none;
  }
</style>
