<!--
  Canvas Component
  Main content area displaying racks
  Multi-rack mode: displays all racks with active selection indicator
  Uses panzoom for zoom and pan functionality
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import panzoom from "panzoom";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import {
    getCanvasStore,
    ZOOM_MIN,
    ZOOM_MAX,
  } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { debug, appDebug } from "$lib/utils/debug";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import {
    classifyRackSwipeGesture,
    RACK_SWIPE_PAN_THRESHOLD,
    useLongPress,
    type RackSwipeDirection,
  } from "$lib/utils/gestures";
  import { dispatchContextMenuAtPoint } from "$lib/utils/context-menu";
  import { hapticSuccess, hapticTap } from "$lib/utils/haptics";
  import RackDualView from "./RackDualView.svelte";
  import BayedRackView from "./BayedRackView.svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  import CanvasContextMenu from "./CanvasContextMenu.svelte";
  // Note: PlacementIndicator removed - placement UI now integrated into Rack.svelte

  // Multi-rack mode: use active rack ID from store

  interface Props {
    partyMode?: boolean;
    /** Enable long press gesture for mobile rack editing */
    enableLongPress?: boolean;
    onnewrack?: () => void;
    onload?: () => void;
    onfitall?: () => void;
    onresetzoom?: () => void;
    ontoggletheme?: () => void;
    onrackselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ slug: string; position: number }>,
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
      }>,
    ) => void;
    /** Mobile long press for rack editing */
    onracklongpress?: (event: CustomEvent<{ rackId: string }>) => void;
    /** Rack context menu: focus rack/group callback */
    onrackfocus?: (rackIds: string[]) => void;
    /** Rack context menu: export rack/group callback */
    onrackexport?: (rackIds: string[]) => void;
    /** Rack context menu: edit rack callback */
    onrackedit?: (rackId: string) => void;
    /** Rack context menu: rename rack callback */
    onrackrename?: (rackId: string) => void;
    /** Rack context menu: duplicate rack callback */
    onrackduplicate?: (rackId: string) => void;
    /** Rack context menu: delete rack callback */
    onrackdelete?: (rackId: string) => void;
  }

  let {
    partyMode = false,
    enableLongPress = false,
    onnewrack,
    onload: _onload,
    onfitall,
    onresetzoom,
    ontoggletheme,
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
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();
  const mobileDebug = appDebug.mobile;

  const SWIPE_SWITCH_ANIMATION_MS = 200;
  const TOUCH_MOVE_LOG_INTERVAL_MS = 120;
  const TOUCH_LISTENER_OPTIONS: AddEventListenerOptions = {
    // Capture keeps swipe tracking robust even if child components stop bubbling.
    // Because listeners are passive and never call stopPropagation/preventDefault,
    // child touch handlers still run and panzoom keeps gesture ownership.
    capture: true,
    passive: true,
  };

  interface SwipeGestureState {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startTime: number;
    isMultiTouch: boolean;
  }

  // Note: handlePlacementCancel removed - now handled in Rack.svelte

  // Handle mobile tap-to-place (uses active rack)
  function handlePlacementTap(
    rackId: string,
    event: CustomEvent<{ position: number; face: "front" | "rear" }>,
  ) {
    const device = placementStore.pendingDevice;
    if (!device) return;

    const { position, face } = event.detail;
    const success = layoutStore.placeDevice(
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
    }
  }

  // Multi-rack mode: access all racks
  const racks = $derived(layoutStore.racks);
  const activeRackId = $derived(layoutStore.activeRackId);
  const hasRacks = $derived(layoutStore.rackCount > 0);
  const rackGroups = $derived(layoutStore.rack_groups);

  // Organize racks: grouped racks in their groups, then ungrouped racks
  const organizedRacks = $derived.by(() => {
    const groupedRackIds = new Set(rackGroups.flatMap((g) => g.rack_ids));
    const ungroupedRacks = racks.filter((r) => !groupedRackIds.has(r.id));

    // Build group entries with their racks
    const groupEntries = rackGroups
      .map((group) => ({
        group,
        racks: group.rack_ids
          .map((id) => racks.find((r) => r.id === id))
          .filter((r): r is (typeof racks)[0] => r !== undefined),
      }))
      .filter((entry) => entry.racks.length > 0);

    return { groupEntries, ungroupedRacks };
  });

  // Panzoom container reference
  let panzoomContainer: HTMLDivElement | null = $state(null);
  let canvasContainer: HTMLDivElement | null = $state(null);
  let swipeGesture: SwipeGestureState | null = null;
  let swipeAnimationDirection: RackSwipeDirection | null = $state(null);
  let swipeAnimationTimeout: ReturnType<typeof setTimeout> | null = null;
  let swipeAnimationEpoch = 0;
  let lastTouchMoveLogAt = 0;
  let canvasLongPressPoint = $state<{ x: number; y: number } | null>(null);
  let canvasLongPressTarget = $state<Element | null>(null);

  function isCanvasRackTarget(target: Element | null): boolean {
    if (!target) return false;
    return Boolean(
      target.closest(
        ".rack-device, .rack-container, .rack-wrapper, .rack-dual-view, .bayed-rack-view",
      ),
    );
  }

  // Keep touch listener lifecycle synced to the current bound canvas element.
  // We intentionally use passive listeners and never call preventDefault here so
  // panzoom retains control for pan/pinch behavior.
  $effect(() => {
    const element = canvasContainer;
    if (!element) {
      canvasStore.setCanvasElement(null);
      return;
    }

    canvasStore.setCanvasElement(element);

    element.addEventListener(
      "touchstart",
      handleCanvasTouchStart,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchmove",
      handleCanvasTouchMove,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchend",
      handleCanvasTouchEnd,
      TOUCH_LISTENER_OPTIONS,
    );
    element.addEventListener(
      "touchcancel",
      handleCanvasTouchCancel,
      TOUCH_LISTENER_OPTIONS,
    );

    return () => {
      element.removeEventListener(
        "touchstart",
        handleCanvasTouchStart,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchmove",
        handleCanvasTouchMove,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchend",
        handleCanvasTouchEnd,
        TOUCH_LISTENER_OPTIONS,
      );
      element.removeEventListener(
        "touchcancel",
        handleCanvasTouchCancel,
        TOUCH_LISTENER_OPTIONS,
      );
      canvasStore.setCanvasElement(null);
    };
  });

  // Long-press on empty canvas opens canvas context menu on mobile/tablet.
  $effect(() => {
    if (!enableLongPress || !canvasContainer) {
      canvasLongPressPoint = null;
      canvasLongPressTarget = null;
      return;
    }

    const cleanup = useLongPress(
      canvasContainer,
      () => {
        const point = canvasLongPressPoint;
        const target = canvasLongPressTarget;
        canvasLongPressPoint = null;
        canvasLongPressTarget = null;

        if (!point || isCanvasRackTarget(target)) return;

        hapticTap();
        dispatchContextMenuAtPoint(point.x, point.y, canvasContainer);
      },
      {
        onStart: (x, y) => {
          canvasLongPressPoint = { x, y };
          canvasLongPressTarget = document.elementFromPoint(x, y);
        },
        onCancel: () => {
          canvasLongPressPoint = null;
          canvasLongPressTarget = null;
        },
      },
    );

    return cleanup;
  });

  onDestroy(() => {
    if (swipeAnimationTimeout) {
      clearTimeout(swipeAnimationTimeout);
      swipeAnimationTimeout = null;
    }
  });

  // Initialize panzoom reactively when container becomes available
  $effect(() => {
    if (panzoomContainer) {
      const instance = panzoom(panzoomContainer, {
        minZoom: ZOOM_MIN,
        maxZoom: ZOOM_MAX,
        smoothScroll: false,
        // Disable default zoom on double-click (we handle zoom via toolbar)
        zoomDoubleClickSpeed: 1,
        // Handle wheel events for zoom and Shift+scroll for horizontal pan
        beforeWheel: (e: WheelEvent) => {
          // Shift+scroll = horizontal pan instead of zoom
          if (e.shiftKey) {
            debug.log("beforeWheel: Shift+scroll, performing horizontal pan");
            // Panzoom will handle this as pan when we return true (ignore zoom)
            // We need to manually pan since panzoom doesn't do Shift+scroll pan
            const panAmount = e.deltaY; // Use deltaY (vertical scroll) as horizontal pan
            const transform = instance.getTransform();
            instance.moveTo(transform.x - panAmount, transform.y);
            e.preventDefault();
            return true; // Tell panzoom to ignore this wheel event (we handled it)
          }
          // Normal scroll = zoom centered on cursor (panzoom default behavior)
          debug.log("beforeWheel: zoom at cursor position");
          return false; // Let panzoom handle zoom
        },
        // Allow panning only when not interacting with drag targets
        beforeMouseDown: (e: MouseEvent) => {
          const target = e.target as HTMLElement;

          // Priority 1: Check if target or any parent is draggable (device drag-drop)
          // For SVGElements, we need to check the draggable attribute differently
          const isDraggableElement =
            (target as HTMLElement).draggable === true ||
            target.getAttribute?.("draggable") === "true" ||
            target.closest?.('[draggable="true"]') !== null;

          if (isDraggableElement) {
            debug.log("beforeMouseDown: blocking pan for draggable element");
            return true; // Block panning, let drag-drop work
          }

          // Priority 2: Check if target is within a rack area
          // This includes: rack-dual-view, rack-container, rack-svg, and all children
          // Clicking anywhere in rack should select it, not pan
          const isWithinRack = target.closest?.(".rack-dual-view") !== null;

          if (isWithinRack) {
            debug.log("beforeMouseDown: blocking pan for rack area element");
            return true; // Block panning, let rack selection work
          }

          // Priority 3: Allow panning only on canvas background outside racks
          debug.log("beforeMouseDown: allowing pan on canvas background");
          return false;
        },
        // Filter out drag events from panzoom handling
        filterKey: () => true,
      });

      debug.log("Panzoom initialized on container:", panzoomContainer);
      canvasStore.setPanzoomInstance(instance);

      // Center content on initial load
      requestAnimationFrame(() => {
        canvasStore.fitAll(racks);
      });

      return () => {
        debug.log("Disposing panzoom");
        canvasStore.disposePanzoom();
      };
    }
  });

  function handleCanvasClick(event: MouseEvent) {
    // Only clear selection if clicking directly on the canvas (not on a rack)
    if (event.target === event.currentTarget) {
      selectionStore.clearSelection();
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
    event: CustomEvent<{ slug: string; position: number }>,
  ) {
    // Find the device by slug and position, then select by ID (UUID-based tracking)
    const targetRack = layoutStore.getRackById(rackId);
    if (targetRack) {
      const device = targetRack.devices.find(
        (d) =>
          d.device_type === event.detail.slug &&
          d.position === event.detail.position,
      );
      if (device) {
        layoutStore.setActiveRack(rackId);
        selectionStore.selectDevice(rackId, device.id);
      }
    }
    ondeviceselect?.(event);
  }

  function handleNewRack() {
    onnewrack?.();
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
    layoutStore.placeDevice(rackId, slug, position, face);
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
    }>,
  ) {
    const { sourceRackId, sourceIndex, targetRackId, targetPosition } =
      event.detail;
    layoutStore.moveDeviceToRack(
      sourceRackId,
      sourceIndex,
      targetRackId,
      targetPosition,
    );
    ondevicemoverack?.(event);
  }

  // NOTE: handleRackViewChange removed in v0.4 (dual-view mode - always show both)

  // Screen reader accessible description of rack contents
  const rackDescription = $derived.by(() => {
    if (racks.length === 0) return "No racks configured";
    const rackWord = racks.length === 1 ? "rack" : "racks";
    const totalDevices = racks.reduce((sum, r) => sum + r.devices.length, 0);
    const deviceWord = totalDevices === 1 ? "device" : "devices";
    return `${racks.length} ${rackWord} with ${totalDevices} ${deviceWord} total`;
  });

  const deviceListDescription = $derived.by(() => {
    const activeRack = layoutStore.activeRack;
    if (!activeRack || activeRack.devices.length === 0) return "";
    const deviceNames = [...activeRack.devices]
      .sort((a, b) => b.position - a.position) // Top to bottom
      .map((d) => {
        const deviceType = layoutStore.device_types.find(
          (dt) => dt.slug === d.device_type,
        );
        const name = d.label || deviceType?.model || d.device_type;
        return `U${d.position}: ${name}`;
      });
    return `Active rack devices from top to bottom: ${deviceNames.join(", ")}`;
  });

  function handleCanvasKeydown(event: KeyboardEvent) {
    // Handle Enter/Space as click for accessibility
    if (event.key === "Enter" || event.key === " ") {
      selectionStore.clearSelection();
    }
  }

  function triggerSwipeAnimation(direction: RackSwipeDirection) {
    if (swipeAnimationTimeout) {
      clearTimeout(swipeAnimationTimeout);
      swipeAnimationTimeout = null;
    }

    const epoch = ++swipeAnimationEpoch;
    swipeAnimationDirection = null;

    Promise.resolve().then(() => {
      if (epoch !== swipeAnimationEpoch) return;

      swipeAnimationDirection = direction;
      swipeAnimationTimeout = setTimeout(() => {
        if (epoch !== swipeAnimationEpoch) return;
        swipeAnimationDirection = null;
        swipeAnimationTimeout = null;
      }, SWIPE_SWITCH_ANIMATION_MS);
    });
  }

  function switchRackFromSwipe(direction: RackSwipeDirection) {
    if (!viewportStore.isMobile || racks.length < 2) {
      return;
    }

    const currentId = layoutStore.activeRackId;
    const currentIndex = currentId
      ? racks.findIndex((rack) => rack.id === currentId)
      : -1;

    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = direction === "next" ? 0 : racks.length - 1;
    } else {
      const delta = direction === "next" ? 1 : -1;
      nextIndex = (currentIndex + delta + racks.length) % racks.length;
    }

    const nextRack = racks[nextIndex];
    if (!nextRack || nextRack.id === currentId) {
      return;
    }

    triggerSwipeAnimation(direction);
    layoutStore.setActiveRack(nextRack.id);
    selectionStore.selectRack(nextRack.id);
    canvasStore.focusRack([nextRack.id], racks, rackGroups, 0);
  }

  function handleCanvasTouchStart(event: TouchEvent) {
    if (
      !viewportStore.isMobile ||
      racks.length < 2 ||
      placementStore.isPlacing ||
      event.touches.length !== 1
    ) {
      swipeGesture = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      swipeGesture = null;
      return;
    }

    swipeGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startTime: performance.now(),
      isMultiTouch: false,
    };
    lastTouchMoveLogAt = 0;
    if (mobileDebug.enabled) {
      mobileDebug(
        "canvas touchstart: x=%d y=%d",
        swipeGesture.startX,
        swipeGesture.startY,
      );
    }
  }

  function handleCanvasTouchMove(event: TouchEvent) {
    if (!swipeGesture) return;

    if (event.touches.length !== 1) {
      swipeGesture.isMultiTouch = true;
      if (mobileDebug.enabled) {
        mobileDebug("canvas touchmove: multitouch detected");
      }
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;

    swipeGesture.currentX = touch.clientX;
    swipeGesture.currentY = touch.clientY;
    if (mobileDebug.enabled) {
      const now = performance.now();
      if (now - lastTouchMoveLogAt >= TOUCH_MOVE_LOG_INTERVAL_MS) {
        mobileDebug(
          "canvas touchmove: x=%d y=%d",
          swipeGesture.currentX,
          swipeGesture.currentY,
        );
        lastTouchMoveLogAt = now;
      }
    }
  }

  function handleCanvasTouchEnd(event: TouchEvent) {
    if (!swipeGesture) return;

    const changedTouch = event.changedTouches[0];
    const endX = changedTouch?.clientX ?? swipeGesture.currentX;
    const endY = changedTouch?.clientY ?? swipeGesture.currentY;
    const durationMs = performance.now() - swipeGesture.startTime;
    const horizontalLock =
      Math.abs(endX - swipeGesture.startX) > RACK_SWIPE_PAN_THRESHOLD;

    if (!horizontalLock) {
      if (mobileDebug.enabled) {
        mobileDebug("canvas touchend: below horizontal lock threshold");
      }
      swipeGesture = null;
      return;
    }

    const direction = classifyRackSwipeGesture({
      startX: swipeGesture.startX,
      startY: swipeGesture.startY,
      endX,
      endY,
      durationMs,
      isMultiTouch: swipeGesture.isMultiTouch,
    });

    if (mobileDebug.enabled) {
      mobileDebug(
        "canvas touchend: direction=%s duration=%dms",
        direction ?? "none",
        Math.round(durationMs),
      );
    }

    swipeGesture = null;

    if (!direction) return;
    if (mobileDebug.enabled) {
      mobileDebug("Swipe detected: %s, switching rack", direction);
    }
    switchRackFromSwipe(direction);
  }

  function handleCanvasTouchCancel() {
    if (mobileDebug.enabled) {
      mobileDebug("canvas touchcancel: gesture reset");
    }
    swipeGesture = null;
  }
</script>

<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- these warnings appear in Vite build but not ESLint -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="application" makes this interactive per WAI-ARIA) -->
<CanvasContextMenu
  onnewrack={handleNewRack}
  onfitall={() => onfitall?.() ?? canvasStore.fitAll(racks)}
  onresetzoom={() => onresetzoom?.() ?? canvasStore.resetZoom()}
  {ontoggletheme}
  theme={uiStore.theme}
>
  <div
    class="canvas"
    class:party-mode={partyMode}
    role="application"
    aria-label={rackDescription}
    aria-describedby={deviceListDescription ? "canvas-device-list" : undefined}
    tabindex="0"
    bind:this={canvasContainer}
    onclick={handleCanvasClick}
    onkeydown={handleCanvasKeydown}
  >
    <!-- Note: Mobile placement indicator now integrated into Rack.svelte -->

    <!-- Hidden description for screen readers -->
    {#if deviceListDescription}
      <p id="canvas-device-list" class="sr-only">{deviceListDescription}</p>
    {/if}
    {#if hasRacks}
      <div class="panzoom-container" bind:this={panzoomContainer}>
        <!-- Multi-rack mode: render racks with visual grouping -->
        <div
          class="racks-wrapper"
          class:swipe-next={swipeAnimationDirection === "next"}
          class:swipe-previous={swipeAnimationDirection === "previous"}
        >
          <!-- Render grouped racks with group labels -->
          {#each organizedRacks.groupEntries as { group, racks: groupRacks } (group.id)}
            {#if group.layout_preset === "bayed"}
              <!-- Bayed/touring racks use special stacked view -->
              <BayedRackView
                {group}
                racks={groupRacks}
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
                ondeviceselect={(e) => {
                  const rackId = activeRackId ?? groupRacks[0]?.id;
                  if (rackId) handleDeviceSelect(rackId, e);
                }}
                ondevicedrop={(e) => handleDeviceDrop(e)}
                ondevicemove={(e) => handleDeviceMove(e)}
                ondevicemoverack={(e) => handleDeviceMoveRack(e)}
                onplacementtap={(e) => {
                  const rackId = activeRackId ?? groupRacks[0]?.id;
                  if (rackId) handlePlacementTap(rackId, e);
                }}
                onlongpress={(e) => onracklongpress?.(e)}
                onfocus={(rackIds) => onrackfocus?.(rackIds)}
                onexport={(rackIds) => onrackexport?.(rackIds)}
                onedit={(rackId) => onrackedit?.(rackId)}
                onrename={(rackId) => onrackrename?.(rackId)}
                onduplicate={(rackId) => onrackduplicate?.(rackId)}
                ondelete={(rackId) => onrackdelete?.(rackId)}
              />
            {:else}
              <!-- Standard row layout for non-bayed groups -->
              <div class="rack-group">
                <div class="group-label">{group.name ?? "Group"}</div>
                <div class="group-racks">
                  {#each groupRacks as rack (rack.id)}
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
                        selectedDeviceId={selectionStore.selectedType ===
                          "device" && selectionStore.selectedRackId === rack.id
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
          {/each}

          <!-- Render ungrouped racks -->
          {#each organizedRacks.ungroupedRacks as rack (rack.id)}
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
    {:else}
      <WelcomeScreen onclick={handleNewRack} />
    {/if}
  </div>
</CanvasContextMenu>

<style>
  .canvas {
    flex: 1;
    overflow: hidden;
    background-color: var(--canvas-bg);
    min-height: 0;
    position: relative;
  }

  .panzoom-container {
    /* No flexbox centering - panzoom controls all positioning */
    /* fitAll() centers content on load and when toolbar button clicked */
    min-width: 100%;
    min-height: 100%;
    transform-origin: 0 0;
    touch-action: none;
    cursor: grab;
  }

  .panzoom-container:active {
    cursor: grabbing;
  }

  .racks-wrapper {
    /* Multi-rack mode: horizontal layout of all racks */
    display: flex;
    flex-direction: row;
    align-items: flex-start; /* Prevent shorter racks from stretching to match tallest */
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
    align-items: flex-start; /* Prevent shorter racks from stretching */
    gap: var(--space-4);
  }

  /* Party mode: animated gradient background */
  @keyframes party-bg {
    0% {
      background-color: hsl(0, 30%, 12%);
    }
    33% {
      background-color: hsl(120, 30%, 12%);
    }
    66% {
      background-color: hsl(240, 30%, 12%);
    }
    100% {
      background-color: hsl(360, 30%, 12%);
    }
  }

  .canvas.party-mode {
    animation: party-bg 4s linear infinite;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .canvas.party-mode {
      animation: none;
    }

    .racks-wrapper.swipe-next,
    .racks-wrapper.swipe-previous {
      animation: none;
    }
  }
</style>
