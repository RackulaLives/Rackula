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
  import { untrack } from "svelte";
  import VerbBar, { type VerbItem } from "./VerbBar.svelte";
  import { getVerbsForSelection } from "$lib/actions/verb-bars";
  import { getRackSlotControls } from "$lib/utils/rack-row";
  import {
    computeVerbBarPosition,
    VERB_BAR_LOW_ZOOM_THRESHOLD,
    type VerbBarPosition,
  } from "$lib/utils/verb-bar-position";
  import {
    resolveActionLabel,
    type ActionEnabledContext,
    type ActionId,
  } from "$lib/actions/registry";
  import {
    moveSelectedDeviceUp,
    moveSelectedDeviceDown,
    moveSelectedDeviceToSlot,
    canMoveSelectedDeviceSlot,
    flipSelectedDeviceFace,
    duplicateSelection,
    moveSelectedRack,
    baySelectedRack,
  } from "$lib/actions/selection-actions";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getStorageMode } from "$lib/storage";
  import {
    anchorKeysForSelection,
    resolveAnchor,
  } from "$lib/utils/anchor-registry";

  // How long a settle loop keeps measuring after the bar last moved. It bridges
  // the gap between a selection or layout commit and the first frame of the
  // device's y tween, then follows the tween until it settles.
  const SETTLE_MS = 200;

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

  // Reorder and bay availability for the selected row slot. A rack or a bayed
  // group carries the target rack id (a group's active member); a device
  // selection has no row-slot controls.
  const isRackOrGroup = $derived(
    selection.isRackSelected || selection.isGroupSelected,
  );

  const slotControls = $derived(
    isRackOrGroup
      ? getRackSlotControls(
          layout.racks,
          layout.rack_groups,
          selection.selectedRackId,
          layout.activeRackId,
        )
      : {
          canReorder: false,
          canMoveLeft: false,
          canMoveRight: false,
          baySource: null,
        },
  );

  // The bay verb is offered only for empty standalone racks and bay groups
  // (baySource), and only when the bayed-racks setting is on. Baying is a
  // mutation, so it is withheld in read-only mode like the other mutation verbs.
  const showBayVerb = $derived(
    !ctx.readOnly && ui.enableBayedRacks && slotControls.baySource !== null,
  );

  // Compose the bar: leading reorder chevrons (position verbs), then a divider,
  // then the object verbs (bay plus the registry-filtered selection verbs).
  // Device selections keep the object-verb-only bar. Chevrons show only when the
  // row has two or more slots and disable at the ends. Reorder is a mutation, so
  // it is withheld in read-only mode (matching getVerbsForSelection's filtering
  // of the object verbs and the move-rack-* enabledWhen predicates).
  const verbs = $derived.by<VerbItem[]>(() => {
    const objectVerbs: VerbItem[] = getVerbsForSelection(ctx).map((a) => ({
      id: a.id,
      label: resolveActionLabel(a, ctx),
    }));

    if (!isRackOrGroup) return objectVerbs;

    const position: VerbItem[] =
      slotControls.canReorder && !ctx.readOnly
        ? [
            {
              id: "move-rack-left",
              label: "Move rack left",
              disabled: !slotControls.canMoveLeft,
            },
            {
              id: "move-rack-right",
              label: "Move rack right",
              disabled: !slotControls.canMoveRight,
            },
          ]
        : [];

    const bayVerbs: VerbItem[] = showBayVerb
      ? [{ id: "bay-rack", label: "Bay rack" }]
      : [];
    const trailing: VerbItem[] = [...bayVerbs, ...objectVerbs];

    // The divider sits before the first object verb only when both sides exist.
    const withDivider =
      position.length > 0
        ? trailing.map((verb, i) =>
            i === 0 ? { ...verb, dividerBefore: true } : verb,
          )
        : trailing;

    return [...position, ...withDivider];
  });

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
      case "move-rack-left":
        moveSelectedRack("left");
        break;
      case "move-rack-right":
        moveSelectedRack("right");
        break;
      case "bay-rack":
        baySelectedRack();
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

  // Registry keys for the selected object's DOM node, recomputed only when the
  // selection changes. Resolving them is a map lookup, not a subtree query.
  const anchorKeys = $derived(
    anchorKeysForSelection({
      deviceId: selection.selectedDeviceId,
      deviceFace: selection.selectedDeviceFace,
      rackId: selection.selectedRackId,
      isDeviceSelected: selection.isDeviceSelected,
      isRackOrGroupSelected: isRackOrGroup,
    }),
  );

  function hide(): void {
    if (pos.visible) pos = { ...pos, visible: false };
  }

  function measure(): void {
    if (!barEl || verbs.length === 0) return hide();
    // The bar is hidden below this zoom anyway; skip the layout reads while
    // zoomed out (a pan or zoom calls this every frame).
    if (canvas.zoom < VERB_BAR_LOW_ZOOM_THRESHOLD) return hide();

    const target = resolveAnchor(anchorKeys);
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

  // Measure every frame until the bar has not moved for SETTLE_MS, then stop.
  // Returns the cancel function.
  function settle(): () => void {
    let raf = 0;
    let deadline = performance.now() + SETTLE_MS;
    const tick = () => {
      const prev = pos;
      measure();
      const now = performance.now();
      if (pos !== prev) deadline = now + SETTLE_MS;
      raf = now < deadline ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }

  // Keep the bar pinned to the selected object without polling. Each source of
  // anchor motion drives its own re-measure:
  // - selection or verb change: a settle loop, which also covers selecting a
  //   device while its move tween is still running;
  // - pan, zoom, inertia and the camera tween: panzoom's transform event, which
  //   fires after each transform is applied;
  // - window or canvas resize (a side panel opening): resize and scroll
  //   listeners plus a ResizeObserver on the canvas;
  // - a layout commit (a move animates over RackDevice's 120ms y tween, a rack
  //   reorder shifts the row): a settle loop.
  // An idle selection does no per-frame work.
  $effect(() => {
    void anchorKeys;
    if (verbs.length === 0) {
      // The {#if verbs.length > 0} template unmounts the bar, so nothing is
      // visible after selection clears. But pos retains its last value; reset
      // it here so a subsequent re-select does not flash the stale position
      // for a frame before the first measure lands.
      hide();
      return;
    }

    const stopSettle = settle();
    const offTransform = canvas.onTransform(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = canvasEl ? new ResizeObserver(() => measure()) : null;
    if (canvasEl) observer?.observe(canvasEl);

    return () => {
      stopSettle();
      offTransform();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  });

  $effect(() => {
    void layout.layout;
    // Untracked: a selection change is handled by the effect above, so it must
    // not start this loop.
    if (untrack(() => verbs.length === 0)) return;
    return settle();
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
