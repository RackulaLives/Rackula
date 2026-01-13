<!--
  Canvas Component
  Main content area displaying racks
  Multi-rack mode: displays all racks with active selection indicator
  Uses panzoom for zoom and pan functionality
-->
<script lang="ts">
  import { onMount } from "svelte";
  import panzoom from "panzoom";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import {
    getCanvasStore,
    ZOOM_MIN,
    ZOOM_MAX,
  } from "$lib/stores/canvas.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { debug } from "$lib/utils/debug";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  // Note: getViewportStore removed - was only used for PlacementIndicator condition
  import { hapticSuccess } from "$lib/utils/haptics";
  import RackDualView from "./RackDualView.svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  // Note: PlacementIndicator removed - placement UI now integrated into Rack.svelte

  // Multi-rack mode: use active rack ID from store

  interface Props {
    partyMode?: boolean;
    /** Enable long press gesture for mobile rack editing */
    enableLongPress?: boolean;
    onnewrack?: () => void;
    onload?: () => void;
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
  }

  let {
    partyMode = false,
    enableLongPress = false,
    onnewrack,
    onload: _onload,
    onrackselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onracklongpress,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const uiStore = getUIStore();
  // Note: viewportStore removed - was only used for PlacementIndicator condition
  const placementStore = getPlacementStore();

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

  // Panzoom container reference
  let panzoomContainer: HTMLDivElement | null = $state(null);
  let canvasContainer: HTMLDivElement | null = $state(null);

  // Set canvas element for viewport measurements
  onMount(() => {
    if (canvasContainer) {
      canvasStore.setCanvasElement(canvasContainer);
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
</script>

<!-- eslint-disable-next-line svelte/no-unused-svelte-ignore -- these warnings appear in Vite build but not ESLint -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (role="application" makes this interactive per WAI-ARIA) -->
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
      <!-- Multi-rack mode: render all racks with active selection indicator -->
      <div class="racks-wrapper">
        {#each racks as rack (rack.id)}
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
            />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <WelcomeScreen onclick={handleNewRack} />
  {/if}
</div>

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
    gap: var(--space-6);
    padding: var(--space-4);
  }

  .rack-wrapper {
    /* Individual rack container with active indicator */
    display: inline-block;
    border-radius: var(--radius-lg);
    transition: box-shadow var(--duration-fast) var(--ease-out);
  }

  .rack-wrapper.active {
    /* Active rack visual indicator - accent outline */
    box-shadow: 0 0 0 3px var(--colour-selection);
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
  }
</style>
