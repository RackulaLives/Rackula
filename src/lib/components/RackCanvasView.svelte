<!--
  RackCanvasView
  Renders all racks inside the panzoom viewport: grouped racks (standard or
  bayed) and ungrouped racks. Owns the device drop/move/select handlers that
  delegate to the layout store and bubble events up to the host. Extracted from
  Canvas.svelte (#1610) so Canvas just owns the viewport shell.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { hapticSuccess, hapticError } from "$lib/utils/haptics";
  import { resolveSelectedDevice } from "$lib/utils/device-selection";
  import type { RackSwipeDirection } from "$lib/utils/gestures";
  import type { DeviceFace } from "$lib/types";
  import RackDualView from "./RackDualView.svelte";
  import BayedRackView from "./BayedRackView.svelte";
  import { organizeRackRow, baySourceForItem } from "$lib/utils/rack-row";
  import { bayRack } from "$lib/actions/selection-actions";
  import { getMinResizeHeight, snapResizeHeight } from "$lib/utils/rack-resize";
  import { U_HEIGHT_PX, getRackWidth } from "$lib/constants/layout";
  import { MAX_RACK_HEIGHT } from "$lib/types/constants";

  interface Props {
    partyMode?: boolean;
    enableLongPress?: boolean;
    /** Active slide animation while switching racks via swipe. */
    swipeAnimationDirection?: RackSwipeDirection | null;
    onrackselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{
        deviceId?: string;
        slug: string;
        position: number;
        face: "front" | "rear";
      }>,
    ) => void;
    ondevicedrop?: (
      event: CustomEvent<{
        rackId: string;
        slug: string;
        position: number;
        face: "front" | "rear";
      }>,
    ) => void;
    ondevicemove?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        newPosition: number;
      }>,
    ) => void;
    ondevicemoverack?: (
      event: CustomEvent<{
        sourceRackId: string;
        sourceIndex: number;
        targetRackId: string;
        targetPosition: number;
        face: DeviceFace;
      }>,
    ) => void;
    onracklongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    onrackfocus?: (rackIds: string[]) => void;
    onrackexport?: (rackIds: string[]) => void;
    onrackedit?: (rackId: string) => void;
    onrackrename?: (rackId: string) => void;
    onrackduplicate?: (rackId: string) => void;
    onrackdelete?: (rackId: string) => void;
  }

  let {
    partyMode = false,
    enableLongPress = false,
    swipeAnimationDirection = null,
    onrackselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onracklongpress,
    onrackfocus,
    onrackexport,
    onrackedit,
    onrackrename,
    onrackduplicate,
    onrackdelete,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const uiStore = getUIStore();
  const placementStore = getPlacementStore();
  const toastStore = getToastStore();

  const racks = $derived(layoutStore.racks);
  const activeRackId = $derived(layoutStore.activeRackId);
  const rackGroups = $derived(layoutStore.rack_groups);

  // Lay racks out as a single horizontal row ordered by Rack.position. Bayed
  // groups stay contiguous and render flush; standalone racks are spaced. See
  // organizeRackRow for the ordering and grouping rules.
  const rowItems = $derived(organizeRackRow(racks, rackGroups));

  // The selected bayed group's id, or null when the selection is not a group.
  // Drives the bay-level resize handle on a bay slot.
  const selectedGroupId = $derived(
    selectionStore.selectedType === "group"
      ? selectionStore.selectedGroupId
      : null,
  );

  // --- Canvas drag-to-resize for standalone racks (#2737) ---
  // Grips on a selected standalone rack drag its height in whole-U steps. The
  // frame previews live via a raw (non-recorded) height set, then commits once
  // on release so undo/redo sees a single step. Only the height changes, never
  // device positions, so placed gear keeps its U-number: empty U lands at the
  // high-numbered open end on grow and is removed from it on shrink.
  type ResizeGrip = "top" | "bottom";

  // A resize affordance targets either a standalone rack or a whole bay. A bay
  // resizes every member together to preserve the equal-height invariant (#2740).
  type ResizeTarget =
    | { kind: "rack"; rackId: string }
    | { kind: "bay"; groupId: string; rackIds: string[] };

  interface ResizeDrag {
    target: ResizeTarget;
    /** The racks the drag mutates (one rack, or every member of a bay). */
    rackIds: string[];
    grip: ResizeGrip;
    startHeight: number;
    startClientY: number;
    minHeight: number;
    previewHeight: number;
    pointerId: number;
  }

  let resizeDrag = $state<ResizeDrag | null>(null);

  // Resize-handle geometry, all screen-space so the affordance reads the same at
  // any zoom (#2824). The visible square is a fixed 11px; the invisible hit area
  // is 44px but shrinks on short racks at low zoom so the top and bottom zones
  // never overlap, with a small gap between them.
  const GRIP_SQUARE_PX = 11;
  const GRIP_HIT_MAX_PX = 44;
  const GRIP_HIT_GAP_PX = 4;

  // Screen-space height of one grip's hit area. Floored at the visible square so
  // it never collapses to zero: resize stays reachable at any zoom, even when
  // half the rack's on-screen height (minus the gap) drops below the square.
  function resizeHitHeightPx(heightU: number): number {
    const rackScreenHeight = heightU * U_HEIGHT_PX * canvasStore.zoom;
    return Math.max(
      GRIP_SQUARE_PX,
      Math.min(GRIP_HIT_MAX_PX, rackScreenHeight / 2 - GRIP_HIT_GAP_PX),
    );
  }

  // The racks a target mutates: a standalone rack is itself; a bay is all its
  // members so they stay equal height.
  function resizeTargetRackIds(target: ResizeTarget): string[] {
    return target.kind === "rack" ? [target.rackId] : target.rackIds;
  }

  // The lowest height the target can shrink to without clipping any device:
  // the highest floor across every rack the target mutates.
  function resizeTargetMinHeight(rackIds: string[]): number {
    let floor = 0;
    for (const id of rackIds) {
      const rack = layoutStore.getRackById(id);
      if (!rack) continue;
      const min = getMinResizeHeight(rack, layoutStore.device_types);
      if (min > floor) floor = min;
    }
    return floor;
  }

  // Commit a settled height to the target as a single recorded step: a standalone
  // rack updates directly; a bay updates every member together.
  function commitResizeHeight(target: ResizeTarget, height: number) {
    if (target.kind === "rack") {
      layoutStore.updateRack(target.rackId, { height });
    } else {
      layoutStore.resizeBayedGroupHeight(target.groupId, height);
    }
    // Direct-manipulation commit (drag release or keyboard step): nudge the
    // camera by the minimum needed to keep the resized extent on screen.
    // Growing past an edge pans (or zooms out) just enough; an in-viewport
    // resize or a shrink stays put. Undo/redo mutate the store directly and
    // never reach here, so the camera holds still for them.
    canvasStore.ensureRacksVisible(
      resizeTargetRackIds(target),
      layoutStore.racks,
      layoutStore.rack_groups,
    );
  }

  // Dragging away from the rack body grows it: up for the top grip, down for
  // the bottom grip. Both keep device positions fixed (open-end growth).
  function resizeGrowPx(
    grip: ResizeGrip,
    startClientY: number,
    clientY: number,
  ): number {
    return grip === "top" ? startClientY - clientY : clientY - startClientY;
  }

  // Keep canvas pan/zoom from hijacking a grip press: panzoom listens for
  // mousedown/touchstart on an ancestor in the bubble phase, so stopping
  // propagation here is enough.
  function blockPan(event: Event) {
    event.stopPropagation();
  }

  function handleResizeStart(
    target: ResizeTarget,
    grip: ResizeGrip,
    event: PointerEvent,
  ) {
    const rackIds = resizeTargetRackIds(target);
    const firstRackId = rackIds[0];
    if (!firstRackId) return;
    const firstRack = layoutStore.getRackById(firstRackId);
    if (!firstRack) return;
    event.preventDefault();
    event.stopPropagation();
    // setPointerCapture is absent in some runtimes (happy-dom tests); guard it
    // the same way RackDevice does so a grip press never throws.
    const el = event.currentTarget as HTMLElement;
    if (el?.setPointerCapture) el.setPointerCapture(event.pointerId);
    // Make a standalone target active so its selection chrome matches; the raw
    // preview below is id-targeted, so correctness does not depend on this.
    if (target.kind === "rack" && activeRackId !== target.rackId) {
      layoutStore.setActiveRack(target.rackId);
    }
    resizeDrag = {
      target,
      rackIds,
      grip,
      startHeight: firstRack.height,
      startClientY: event.clientY,
      minHeight: resizeTargetMinHeight(rackIds),
      previewHeight: firstRack.height,
      pointerId: event.pointerId,
    };
  }

  function handleResizeMove(event: PointerEvent) {
    const drag = resizeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const pxPerU = U_HEIGHT_PX * canvasStore.zoom;
    const previewHeight = snapResizeHeight({
      startHeight: drag.startHeight,
      growPx: resizeGrowPx(drag.grip, drag.startClientY, event.clientY),
      pxPerU,
      minHeight: drag.minHeight,
      maxHeight: MAX_RACK_HEIGHT,
      // Measure hysteresis from the step already on screen so jitter at a U
      // boundary does not flip the preview back and forth (#2821).
      currentHeight: drag.previewHeight,
    });
    if (previewHeight === drag.previewHeight) return;
    drag.previewHeight = previewHeight;
    // Live frame preview, id-targeted so a mid-drag active-rack change cannot
    // resize the wrong rack. Raw set records no history and leaves the doc clean.
    for (const id of drag.rackIds) {
      layoutStore.updateRackRaw({ height: previewHeight }, id);
    }
  }

  function handleResizeEnd(event: PointerEvent) {
    const drag = resizeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    // Recompute from the release position so a fast release that outran the
    // last pointermove still commits the height under the pointer.
    const pxPerU = U_HEIGHT_PX * canvasStore.zoom;
    const finalHeight = snapResizeHeight({
      startHeight: drag.startHeight,
      growPx: resizeGrowPx(drag.grip, drag.startClientY, event.clientY),
      pxPerU,
      minHeight: drag.minHeight,
      maxHeight: MAX_RACK_HEIGHT,
      // Apply the same hysteresis as the live preview so the release cannot
      // land one U off the height shown under the pointer (#2821).
      currentHeight: drag.previewHeight,
    });
    const { target, rackIds, startHeight } = drag;
    resizeDrag = null;
    // Rewind the preview (id-targeted), then commit once so undo sees
    // start -> final as a single step.
    for (const id of rackIds) {
      layoutStore.updateRackRaw({ height: startHeight }, id);
    }
    if (finalHeight !== startHeight) {
      commitResizeHeight(target, finalHeight);
    }
  }

  function handleResizeCancel(event: PointerEvent) {
    const drag = resizeDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { rackIds, startHeight } = drag;
    resizeDrag = null;
    for (const id of rackIds) {
      layoutStore.updateRackRaw({ height: startHeight }, id);
    }
  }

  // Keyboard resize for a focused grip: Arrow Up grows, Arrow Down shrinks by
  // one U. Each press is its own undoable step. A bay grip moves every member.
  function handleResizeKey(target: ResizeTarget, event: KeyboardEvent) {
    let delta: number;
    if (event.key === "ArrowUp") delta = 1;
    else if (event.key === "ArrowDown") delta = -1;
    else return;
    const rackIds = resizeTargetRackIds(target);
    const firstRackId = rackIds[0];
    if (!firstRackId) return;
    const firstRack = layoutStore.getRackById(firstRackId);
    if (!firstRack) return;
    event.preventDefault();
    event.stopPropagation();
    const minHeight = resizeTargetMinHeight(rackIds);
    const next = Math.max(
      minHeight,
      Math.min(MAX_RACK_HEIGHT, firstRack.height + delta),
    );
    if (next === firstRack.height) return;
    if (target.kind === "rack" && activeRackId !== target.rackId) {
      layoutStore.setActiveRack(target.rackId);
    }
    commitResizeHeight(target, next);
  }

  // --- Baying: create / extend a bay (#2740) ---
  // Both the verb bar's bay action and the resistant edge drag run one shared
  // store action (bayRack) that forms a bay from a standalone rack or extends an
  // existing bay, with the new member inheriting width / form factor / height
  // from the source, then keeps the result on screen (#2822, #2825).

  // Resistant right-edge drag: a rubber-band ghost that snaps past a threshold
  // to create or extend a bay (#2740). Baying is a creation-time affordance, so
  // the grip is offered only on an empty standalone rack and on a bay group's
  // right edge (populated standalone racks show none), matching baySourceForItem
  // and the verb bar bay action (#2823).
  const BAY_SNAP_FRACTION = 0.5;

  interface BayDrag {
    rackId: string;
    startClientX: number;
    /** Source rack width in local (unscaled) canvas px, from the rack model. */
    localWidth: number;
    /** Rightward drag distance in screen px, clamped to >= 0. */
    growPx: number;
    /** Pulled past the snap threshold: releasing now commits the bay. */
    armed: boolean;
    pointerId: number;
  }

  let bayDrag = $state<BayDrag | null>(null);

  // Screen-px distance that arms the snap: half a rack width, scaled by zoom so
  // the threshold tracks the rack's on-screen size. The pointer delta (growPx)
  // is in screen px, so the threshold must be too.
  function baySnapThreshold(drag: BayDrag): number {
    return drag.localWidth * canvasStore.zoom * BAY_SNAP_FRACTION;
  }

  // The ghost preview shown to the right of the dragged rack. Its width is in
  // local canvas coords (the ghost renders inside the zoomed canvas, so the
  // browser scales it by zoom for us). It resists, revealing at a fraction of
  // the pull until armed, then snaps to a full-width phantom.
  const bayGhost = $derived.by(() => {
    const drag = bayDrag;
    if (!drag || drag.localWidth <= 0) return null;
    const threshold = baySnapThreshold(drag);
    const reveal = threshold > 0 ? Math.min(1, drag.growPx / threshold) : 0;
    const widthPx = drag.armed
      ? drag.localWidth
      : drag.localWidth * reveal * 0.7;
    return { rackId: drag.rackId, widthPx, armed: drag.armed };
  });

  function handleBayDragStart(rackId: string, event: PointerEvent) {
    const rack = layoutStore.getRackById(rackId);
    if (!rack) return;
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    if (el?.setPointerCapture) el.setPointerCapture(event.pointerId);
    bayDrag = {
      rackId,
      startClientX: event.clientX,
      localWidth: getRackWidth(rack.width),
      growPx: 0,
      armed: false,
      pointerId: event.pointerId,
    };
  }

  function handleBayDragMove(event: PointerEvent) {
    const drag = bayDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const growPx = Math.max(0, event.clientX - drag.startClientX);
    const armed = drag.localWidth > 0 && growPx >= baySnapThreshold(drag);
    if (growPx === drag.growPx && armed === drag.armed) return;
    drag.growPx = growPx;
    drag.armed = armed;
  }

  function handleBayDragEnd(event: PointerEvent) {
    const drag = bayDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { rackId, armed } = drag;
    bayDrag = null;
    if (armed) bayRack(rackId);
  }

  function handleBayDragCancel(event: PointerEvent) {
    const drag = bayDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    bayDrag = null;
  }

  // Handle mobile tap-to-place (uses active rack)
  function handlePlacementTap(
    rackId: string,
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) {
    const device = placementStore.pendingDevice;
    if (!device) return;

    const { position, face } = event.detail;
    // Carrier-first: a sub-U / half-width device synthesises (or fills) a
    // carrier; whole-U full-width gear mounts directly to the rails.
    const success = layoutStore.placeDeviceSmart(
      rackId,
      device.slug,
      position,
      face,
    );

    if (success) {
      hapticSuccess();
      placementStore.completePlacement();
      // Reset view to show full rack after placement completes
      canvasStore.fitAll(layoutStore.racks);
    } else {
      // Block-live UX (D5): the placement was refused (carrier-required,
      // collision, or out of bounds); tell the user rather than fail silently.
      hapticError();
      toastStore.showToast("Can't place device here", "warning", 3000);
    }
  }

  function handleRackSelect(event: CustomEvent<{ rackId: string }>) {
    const { rackId } = event.detail;
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
    onrackselect?.(event);
  }

  function handleGroupSelect(event: CustomEvent<{ groupId: string }>) {
    const { groupId } = event.detail;
    const group = layoutStore.getRackGroupById(groupId);
    if (!group || group.rack_ids.length === 0) return;
    const activeRackInGroup =
      activeRackId && group.rack_ids.includes(activeRackId)
        ? activeRackId
        : group.rack_ids[0];
    layoutStore.setActiveRack(activeRackInGroup ?? null);
    selectionStore.selectGroup(groupId, activeRackInGroup);
  }

  function handleDeviceSelect(
    rackId: string,
    event: CustomEvent<{
      deviceId?: string;
      slug: string;
      position: number;
      face: "front" | "rear";
    }>,
  ) {
    // Resolve the placed device by its UUID when available. The legacy
    // (slug, position) fallback is ambiguous for two half-width devices sharing
    // the same U (#1680), where it always resolved to the left device and left
    // the right one unselectable.
    const targetRack = layoutStore.getRackById(rackId);
    if (targetRack) {
      const device = resolveSelectedDevice(targetRack, event.detail);
      if (device) {
        layoutStore.setActiveRack(rackId);
        // Pass the clicked face so view-relative UI (the verb bar, #2646) anchors
        // to the copy that was clicked: a full-depth device renders in both the
        // front and rear views under one UUID.
        selectionStore.selectDevice(rackId, device.id, event.detail.face);
      }
    }
    ondeviceselect?.(event);
  }

  function handleDeviceDrop(
    event: CustomEvent<{
      rackId: string;
      slug: string;
      position: number;
      face: "front" | "rear";
    }>,
  ) {
    const { rackId, slug, position, face } = event.detail;
    const placed = layoutStore.placeDevice(rackId, slug, position, face);
    // Block-live UX (D5): the store refuses an invalid rail placement (a
    // carrier-requiring device, a collision, or out of bounds). Tell the user
    // rather than fail silently, and do not signal a drop that did not happen.
    if (!placed) {
      hapticError();
      toastStore.showToast("Can't place device here", "warning", 3000);
      return;
    }
    // A completed drag-and-drop is an unambiguous choice of the DnD path, so
    // abandon any placement armed via the command palette "Add device" flow
    // (#2352). Without this the desktop click-to-place stays armed and the next
    // rack click would silently place the still-pending device.
    if (placementStore.isPlacing) placementStore.abandonPlacement();
    ondevicedrop?.(event);
  }

  function handleDeviceMove(
    event: CustomEvent<{
      rackId: string;
      deviceIndex: number;
      newPosition: number;
    }>,
  ) {
    const { rackId, deviceIndex, newPosition } = event.detail;
    layoutStore.moveDevice(rackId, deviceIndex, newPosition);
    ondevicemove?.(event);
  }

  function handleDeviceMoveRack(
    event: CustomEvent<{
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetPosition: number;
      face: DeviceFace;
    }>,
  ) {
    const { sourceRackId, sourceIndex, targetRackId, targetPosition, face } =
      event.detail;
    layoutStore.moveDeviceToRack(
      sourceRackId,
      sourceIndex,
      targetRackId,
      targetPosition,
      face,
    );
    ondevicemoverack?.(event);
  }
</script>

<!-- Single bottom-aligned row: every rack lives in this one row, ordered by
     Rack.position. Standalone racks are spaced; bayed groups render flush via
     BayedRackView. There is no free 2D placement. role="list" gives the rack
     containers (role="listitem", see RackDualView and Rack) a valid required
     parent. The racks are listitems, not options, because each holds interactive
     device buttons and an interactive option may not contain focusable
     descendants (nested-interactive, #2255); the active rack is announced via
     aria-current. -->
<div
  class="racks-wrapper"
  role="list"
  aria-label="Racks"
  class:swipe-next={swipeAnimationDirection === "next"}
  class:swipe-previous={swipeAnimationDirection === "previous"}
>
  {#snippet resizeGrip(target: ResizeTarget, side: ResizeGrip, heightU: number)}
    {@const scale = 1 / canvasStore.zoom}
    <button
      type="button"
      class="resize-grip resize-grip-{side}"
      style:--grip-scale={scale}
      style:--grip-hit-max-px="{GRIP_HIT_MAX_PX}px"
      style:--grip-square-px="{GRIP_SQUARE_PX}px"
      style:height="{resizeHitHeightPx(heightU) * scale}px"
      aria-label={`Resize ${target.kind === "bay" ? "bay" : "rack"} height from ${side} edge`}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title="Drag to resize. Arrow Up grows, Arrow Down shrinks."
      onpointerdown={(e) => handleResizeStart(target, side, e)}
      onpointermove={handleResizeMove}
      onpointerup={handleResizeEnd}
      onpointercancel={handleResizeCancel}
      onmousedown={blockPan}
      ontouchstart={blockPan}
      onkeydown={(e) => handleResizeKey(target, e)}
    >
      <span class="grip-square" aria-hidden="true"></span>
    </button>
  {/snippet}
  {#each rowItems as item (item.kind === "rack" ? `rack:${item.rack.id}` : `group:${item.group.id}`)}
    <div class="row-slot">
      {#if item.kind === "rack"}
        {@const rack = item.rack}
        {@const isActive = rack.id === activeRackId}
        {@const isSelected =
          selectionStore.selectedType === "rack" &&
          selectionStore.selectedRackId === rack.id}
        <div
          class="rack-wrapper"
          class:active={isActive}
          class:resizable={isSelected}
          style:transform={resizeDrag?.target.kind === "rack" &&
          resizeDrag.target.rackId === rack.id &&
          resizeDrag.grip === "bottom"
            ? `translateY(${(resizeDrag.previewHeight - resizeDrag.startHeight) * U_HEIGHT_PX}px)`
            : undefined}
        >
          <RackDualView
            {rack}
            deviceLibrary={layoutStore.device_types}
            selected={isSelected}
            {isActive}
            selectedDeviceId={selectionStore.selectedType === "device" &&
            selectionStore.selectedRackId === rack.id
              ? selectionStore.selectedDeviceId
              : null}
            displayMode={uiStore.displayMode}
            showLabelsOnImages={uiStore.showLabelsOnImages}
            showAnnotations={uiStore.showAnnotations}
            annotationField={uiStore.annotationField}
            showBanana={uiStore.showBanana}
            {partyMode}
            {enableLongPress}
            onselect={(e) => handleRackSelect(e)}
            ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
            ondevicedrop={(e) => handleDeviceDrop(e)}
            ondevicemove={(e) => handleDeviceMove(e)}
            ondevicemoverack={(e) => handleDeviceMoveRack(e)}
            onplacementtap={(e) => handlePlacementTap(rack.id, e)}
            onlongpress={(e) => onracklongpress?.(e)}
            onfocus={() => onrackfocus?.([rack.id])}
            onexport={() => onrackexport?.([rack.id])}
            onedit={() => onrackedit?.(rack.id)}
            onrename={() => onrackrename?.(rack.id)}
            onduplicate={() => onrackduplicate?.(rack.id)}
            ondelete={() => onrackdelete?.(rack.id)}
          />
          {#if isSelected}
            {@render resizeGrip(
              { kind: "rack", rackId: rack.id },
              "top",
              rack.height,
            )}
            {@render resizeGrip(
              { kind: "rack", rackId: rack.id },
              "bottom",
              rack.height,
            )}
            {#if resizeDrag?.target.kind === "rack" && resizeDrag.target.rackId === rack.id}
              <div
                class="resize-readout resize-readout-{resizeDrag.grip}"
                role="status"
                aria-live="polite"
              >
                {resizeDrag.previewHeight}U
              </div>
            {/if}
            <!-- Resistant right-edge drag, gated to match the verb bar bay
                 action (#2823): baySourceForItem offers it only on an empty
                 standalone rack (populated standalone racks show no bay
                 affordance), ANDed with the bayed-racks setting (#2742) and
                 suppressed in read-only mode. Pull right past the snap threshold
                 to create a bayed rack. -->
            {#if !uiStore.readOnly && uiStore.enableBayedRacks && baySourceForItem(item, activeRackId) !== null}
              <button
                type="button"
                class="bay-edge-grip"
                aria-label="Drag right to bay a new rack"
                title="Drag right to create a bayed rack"
                tabindex="-1"
                onpointerdown={(e) => handleBayDragStart(rack.id, e)}
                onpointermove={handleBayDragMove}
                onpointerup={handleBayDragEnd}
                onpointercancel={handleBayDragCancel}
                onmousedown={blockPan}
                ontouchstart={blockPan}
              >
                <span class="edge-grip-bar" aria-hidden="true"></span>
              </button>
              {#if bayGhost && bayGhost.rackId === rack.id}
                <div
                  class="bay-ghost"
                  class:armed={bayGhost.armed}
                  style:width="{bayGhost.widthPx}px"
                  aria-hidden="true"
                ></div>
                <div class="bay-drag-readout" role="status" aria-live="polite">
                  {bayGhost.armed ? "Release to bay" : "Pull to bay"}
                </div>
              {/if}
            {/if}
          {/if}
        </div>
      {:else if item.group.layout_preset === "bayed"}
        {@const isBaySelected = item.group.id === selectedGroupId}
        {@const bayTarget = {
          kind: "bay" as const,
          groupId: item.group.id,
          rackIds: item.racks.map((member) => member.id),
        }}
        <!-- Bayed/touring racks render flush (no gap) via the stacked dual view.
             The wrapper hosts the one bay-level resize handle that resizes every
             member together, preserving the equal-height invariant (#2740). -->
        <div class="bay-wrapper" class:resizable={isBaySelected}>
          <BayedRackView
            group={item.group}
            racks={item.racks}
            deviceLibrary={layoutStore.device_types}
            {activeRackId}
            selectedDeviceId={selectionStore.selectedType === "device"
              ? selectionStore.selectedDeviceId
              : null}
            selectedRackId={selectionStore.selectedType === "rack"
              ? selectionStore.selectedRackId
              : null}
            displayMode={uiStore.displayMode}
            showLabelsOnImages={uiStore.showLabelsOnImages}
            showAnnotations={uiStore.showAnnotations}
            annotationField={uiStore.annotationField}
            {partyMode}
            {enableLongPress}
            ongroupselect={(e) => handleGroupSelect(e)}
            ondeviceselect={(e) => handleDeviceSelect(e.detail.rackId, e)}
            ondevicedrop={(e) => handleDeviceDrop(e)}
            ondevicemove={(e) => handleDeviceMove(e)}
            ondevicemoverack={(e) => handleDeviceMoveRack(e)}
            onplacementtap={(e) => handlePlacementTap(e.detail.rackId, e)}
            onlongpress={(e) => onracklongpress?.(e)}
            onfocus={(rackIds) => onrackfocus?.(rackIds)}
            onexport={(rackIds) => onrackexport?.(rackIds)}
            onedit={(rackId) => onrackedit?.(rackId)}
            onrename={(rackId) => onrackrename?.(rackId)}
            onduplicate={(rackId) => onrackduplicate?.(rackId)}
            ondelete={(rackId) => onrackdelete?.(rackId)}
            enableBayDrag={isBaySelected &&
              uiStore.enableBayedRacks &&
              !uiStore.readOnly}
            {bayGhost}
            onbaydragstart={handleBayDragStart}
            onbaydragmove={handleBayDragMove}
            onbaydragend={handleBayDragEnd}
            onbaydragcancel={handleBayDragCancel}
          />
          {#if isBaySelected && uiStore.enableBayedRacks}
            <!-- One bay-level handle (AC6). It lives on the top edge: the bay is
                 bottom-anchored in the row, so a top grip grows upward to match
                 the drag with no preview transform. A bottom grip cannot: the
                 stacked front+rear rows grow the wrapper by twice the height
                 delta, so no single translateY tracks the pointer.
                 Gated on the bayed-racks setting (#2742). -->
            {@render resizeGrip(bayTarget, "top", item.racks[0]?.height ?? 0)}
            {#if resizeDrag?.target.kind === "bay" && resizeDrag.target.groupId === item.group.id}
              <div
                class="resize-readout resize-readout-{resizeDrag.grip}"
                role="status"
                aria-live="polite"
              >
                {resizeDrag.previewHeight}U
              </div>
            {/if}
          {/if}
        </div>
      {:else}
        <!-- Standard row layout for non-bayed groups -->
        <div class="rack-group">
          <div class="group-label">{item.group.name ?? "Group"}</div>
          <div class="group-racks">
            {#each item.racks as rack (rack.id)}
              {@const isActive = rack.id === activeRackId}
              {@const isSelected =
                selectionStore.selectedType === "rack" &&
                selectionStore.selectedRackId === rack.id}
              <div class="rack-wrapper" class:active={isActive}>
                <RackDualView
                  {rack}
                  deviceLibrary={layoutStore.device_types}
                  selected={isSelected}
                  {isActive}
                  selectedDeviceId={selectionStore.selectedType === "device" &&
                  selectionStore.selectedRackId === rack.id
                    ? selectionStore.selectedDeviceId
                    : null}
                  displayMode={uiStore.displayMode}
                  showLabelsOnImages={uiStore.showLabelsOnImages}
                  showAnnotations={uiStore.showAnnotations}
                  annotationField={uiStore.annotationField}
                  showBanana={uiStore.showBanana}
                  {partyMode}
                  {enableLongPress}
                  onselect={(e) => handleRackSelect(e)}
                  ondeviceselect={(e) => handleDeviceSelect(rack.id, e)}
                  ondevicedrop={(e) => handleDeviceDrop(e)}
                  ondevicemove={(e) => handleDeviceMove(e)}
                  ondevicemoverack={(e) => handleDeviceMoveRack(e)}
                  onplacementtap={(e) => handlePlacementTap(rack.id, e)}
                  onlongpress={(e) => onracklongpress?.(e)}
                  onfocus={() => onrackfocus?.([rack.id])}
                  onexport={() => onrackexport?.([rack.id])}
                  onedit={() => onrackedit?.(rack.id)}
                  onrename={() => onrackrename?.(rack.id)}
                  onduplicate={() => onrackduplicate?.(rack.id)}
                  ondelete={() => onrackdelete?.(rack.id)}
                />
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .racks-wrapper {
    /* Single bottom-aligned row: racks share a common baseline (their bases)
       whatever their height, like racks standing on a floor. flex-end also
       stops shorter racks stretching to match the tallest. */
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: var(--space-6);
    padding: var(--space-4);
  }

  .racks-wrapper.swipe-next {
    animation: rack-swipe-next 200ms var(--ease-out, ease-out);
  }

  .racks-wrapper.swipe-previous {
    animation: rack-swipe-previous 200ms var(--ease-out, ease-out);
  }

  @keyframes rack-swipe-next {
    0% {
      opacity: 1;
      transform: translateX(0);
    }
    50% {
      opacity: 0.9;
      transform: translateX(-18px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes rack-swipe-previous {
    0% {
      opacity: 1;
      transform: translateX(0);
    }
    50% {
      opacity: 0.9;
      transform: translateX(18px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .rack-wrapper {
    /* Individual rack container - selection styling handled by RackDualView */
    display: inline-block;
    border-radius: var(--radius-lg);
  }

  /* Rack group visual container (for non-bayed groups; bayed uses BayedRackView) */
  .rack-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 2px dashed var(--colour-border);
    border-radius: var(--radius-lg);
    background: var(--colour-surface-overlay, rgba(40, 42, 54, 0.3));
  }

  .group-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0 var(--space-1);
  }

  .group-racks {
    display: flex;
    flex-direction: row;
    align-items: flex-end; /* Bottom-align differing-height racks in the group */
    gap: var(--space-4);
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .racks-wrapper.swipe-next,
    .racks-wrapper.swipe-previous {
      animation: none;
    }
  }

  /* One row slot per rack or bayed group. The wrapper is the flex child the
     row gap and bottom-alignment act on, so slots share the baseline whatever
     their height. Reorder and bay controls now live on the floating verb bar
     (#2822), not in this lane. */
  .row-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Drag-to-resize grips on a selected standalone rack (#2737). The wrapper is
     the positioning context; grips straddle the frame's top and bottom edges
     and the readout reports the live height during a drag. */
  .rack-wrapper.resizable {
    position: relative;
  }

  .resize-grip {
    position: absolute;
    left: 50%;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* Screen-space hit width; height is set inline per rack so the top and
       bottom zones shrink on short racks at low zoom and never overlap (#2824). */
    width: calc(var(--grip-hit-max-px, 44px) * var(--grip-scale, 1));
    padding: 0;
    border: none;
    background: transparent;
    cursor: ns-resize;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .resize-grip-top {
    top: 0;
    transform: translate(-50%, -50%);
  }

  .resize-grip-bottom {
    bottom: 0;
    transform: translate(-50%, 50%);
  }

  /* Edge-midpoint square centred on the selection outline: the vector-tool
     convention for axis-only resize. Sized in screen space via --grip-scale so
     it holds ~11px at any zoom (#2824). */
  .grip-square {
    width: calc(var(--grip-square-px, 11px) * var(--grip-scale, 1));
    height: calc(var(--grip-square-px, 11px) * var(--grip-scale, 1));
    border: calc(1.5px * var(--grip-scale, 1)) solid var(--colour-selection);
    border-radius: calc(2px * var(--grip-scale, 1));
    background: var(--colour-surface);
  }

  .resize-grip:hover .grip-square,
  .resize-grip:focus-visible .grip-square {
    background: var(--colour-selection);
  }

  .resize-grip:focus-visible {
    outline: none;
  }

  .resize-grip:focus-visible .grip-square {
    box-shadow: var(--focus-ring-glow);
  }

  @media (prefers-reduced-motion: no-preference) {
    .grip-square {
      transition: background-color var(--duration-fast) var(--ease-out);
    }
  }

  /* Live height readout: the signature of the resize interaction. */
  .resize-readout {
    position: absolute;
    left: 50%;
    z-index: 3;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    background: var(--colour-selection);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold, 600);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
  }

  .resize-readout-top {
    top: 0;
    transform: translate(-50%, calc(-100% - var(--space-2)));
  }

  .resize-readout-bottom {
    bottom: 0;
    transform: translate(-50%, calc(100% + var(--space-2)));
  }

  /* Bayed-group wrapper: the positioning context for the bay-level resize grips
     and readout. */
  .bay-wrapper {
    position: relative;
    display: inline-block;
  }

  /* Resistant right-edge drag grip (empty racks only). Hugs the right edge; the
     bar reads as a vertical rail you pull rightward to spawn a bay. */
  .bay-edge-grip {
    position: absolute;
    top: 50%;
    right: 0;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 56px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
    transform: translate(50%, -50%);
    -webkit-tap-highlight-color: transparent;
  }

  .edge-grip-bar {
    width: 6px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--colour-border);
    box-shadow: 0 0 0 4px var(--colour-surface-overlay, rgba(40, 42, 54, 0.6));
  }

  .bay-edge-grip:hover .edge-grip-bar,
  .bay-edge-grip:focus-visible .edge-grip-bar {
    background: var(--colour-selection);
  }

  .bay-edge-grip:focus-visible {
    outline: none;
  }

  .bay-edge-grip:focus-visible .edge-grip-bar {
    box-shadow:
      0 0 0 4px var(--colour-surface-overlay, rgba(40, 42, 54, 0.6)),
      var(--focus-ring-glow);
  }

  @media (prefers-reduced-motion: no-preference) {
    .edge-grip-bar {
      transition: background-color var(--duration-fast) var(--ease-out);
    }
  }

  /* Ghost preview of the rack the edge drag would spawn: a dashed phantom to the
     right whose width tracks the pull and snaps solid once armed. */
  .bay-ghost {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 100%;
    z-index: 1;
    border: 2px dashed var(--colour-border);
    border-radius: var(--radius-lg);
    background: var(--colour-surface-overlay, rgba(40, 42, 54, 0.35));
    pointer-events: none;
  }

  .bay-ghost.armed {
    border-style: solid;
    border-color: var(--colour-selection);
    background: var(--colour-overlay-hover, rgba(80, 250, 123, 0.12));
  }

  .bay-drag-readout {
    position: absolute;
    top: 0;
    left: 100%;
    z-index: 3;
    margin-left: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    background: var(--colour-selection);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold, 600);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
  }
</style>
