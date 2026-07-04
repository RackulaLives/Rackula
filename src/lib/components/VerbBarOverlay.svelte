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
  import VerbBar, { type VerbItem } from "./VerbBar.svelte";
  import { getVerbsForSelection } from "$lib/actions/verb-bars";
  import { getRackSlotControls } from "$lib/utils/rack-row";
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
    moveSelectedRack,
    baySelectedRack,
  } from "$lib/actions/selection-actions";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getStorageMode } from "$lib/storage";

  // How long the measure loop keeps running after the last detected motion
  // before going idle. Motion in flight (a pan/zoom gesture, the camera tween,
  // or the bar still moving) extends this every frame; it only needs to bridge
  // the gap between a discrete wake (selection, camera, or layout commit) and
  // the first frame that registers the resulting position change.
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
      label: a.label,
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

  /** Resolve the DOM node the bar points at. */
  function findTarget(): Element | null {
    if (!canvasEl) return null;

    if (selection.isDeviceSelected && selection.selectedDeviceId) {
      const uuid = CSS.escape(selection.selectedDeviceId);
      // A full-depth device renders in both the front and rear views under one
      // UUID, so a bare UUID selector always resolves to the first (front) copy.
      // Anchor to the copy in the view the device was clicked (#2646); fall back
      // to the first match when the face is unknown (keyboard/palette selection).
      const face = selection.selectedDeviceFace;
      if (face === "front" || face === "rear") {
        const inFace = canvasEl.querySelector(
          `[data-device-uuid="${uuid}"][data-device-face="${face}"]`,
        );
        if (inFace) return inFace;
      }
      return canvasEl.querySelector(`[data-device-uuid="${uuid}"]`);
    }

    // A rack selection, or a bayed-group selection whose active member carries
    // the rack id, anchors to that rack's container. Group members render with
    // data-rack-id in BayedRackView, so the same query resolves both.
    if (
      (selection.isRackSelected || selection.isGroupSelected) &&
      selection.selectedRackId
    ) {
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

  // A reactive signature of the anchor's geometry. Reading it in the measure
  // effect wakes the loop on committed moves (the 120ms settle tween), rack
  // reorder, bayed-group reorder, and container resize, none of which produce a
  // per-frame signal. Camera/pan/zoom motion is signalled separately via
  // canvas.isInteracting / cameraMoveId.
  const anchorSignal = $derived.by<string | null>(() => {
    if (selection.isDeviceSelected && selection.selectedDeviceId) {
      const id = selection.selectedDeviceId;
      // Track the rack's row index, its bayed-group index, and its slot within
      // that group's rack_ids so the signature changes on every reorder that
      // moves the device's screen x. reorderRacks rewrites rack.position and
      // the array order (row index catches it). reorderRacksInGroup swaps
      // only group.rack_ids and leaves rack.position untouched, but bayed
      // members render flush in rack_ids order (stable position sort when
      // positions are equal), so an internal group reorder still moves the
      // device; the slot index catches it. rack.position is included too as
      // the persisted row-order field.
      for (const [i, rack] of layout.racks.entries()) {
        for (const dev of rack.devices) {
          if (dev.id === id) {
            const group = layout.rack_groups.find((g) =>
              g.rack_ids.includes(rack.id),
            );
            const gIdx = group ? layout.rack_groups.indexOf(group) : -1;
            const slotInGroup = group ? group.rack_ids.indexOf(rack.id) : -1;
            return `${rack.id}|${i}|${gIdx}|${slotInGroup}|${rack.position}|${rack.width}|${rack.height}|${dev.position}|${dev.device_type}`;
          }
        }
      }
      return null;
    }
    if (selection.isRackSelected || selection.isGroupSelected) {
      const id = selection.selectedRackId ?? "";
      const idx = layout.racks.findIndex((r) => r.id === id);
      const rack = idx >= 0 ? layout.racks[idx] : null;
      const gidx = layout.rack_groups.findIndex((g) => g.rack_ids.includes(id));
      return `${idx}|${gidx}|${rack ? rack.width : 0}|${rack ? rack.height : 0}`;
    }
    return null;
  });

  // Keep the bar pinned to the selected object. Pan has no reactive signal in
  // the canvas store (panzoom mutates the DOM transform directly) and the
  // camera tween animates the transform without per-frame state, so a
  // requestAnimationFrame loop tracks motion in flight. The loop is gated: it
  // runs only while a motion signal is active (a pan/zoom gesture, the camera
  // tween, or a layout commit that moves the anchor) and for the SETTLE_MS
  // window after, then stops. An idle selection does zero per-frame work: no
  // rAF tick, no querySelector, no getBoundingClientRect.
  $effect(() => {
    void selection.selectedDeviceId;
    void selection.selectedRackId;
    void verbs;
    void canvas.isInteracting;
    void canvas.cameraMoveId;
    void anchorSignal;
    if (verbs.length === 0) {
      // The {#if verbs.length > 0} template unmounts the bar, so nothing is
      // visible after selection clears. But pos retains its last value; reset
      // it here so a subsequent re-select does not flash the stale position
      // for a frame before the first measure() tick lands.
      hide();
      return;
    }

    let raf = 0;
    // Stop the loop once this deadline expires with no motion in flight. Any
    // wake (selection, verb, camera, or layout-commit change) resets it; an
    // active gesture or tween, or the bar still moving, keeps extending it.
    let deadline = performance.now() + SETTLE_MS;
    const tick = () => {
      const prev = pos;
      measure();
      const moved = pos !== prev;
      const interacting = canvas.isInteracting;
      const now = performance.now();
      if (interacting || moved) deadline = now + SETTLE_MS;
      if (now < deadline) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
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
