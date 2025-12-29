<!--
  Canvas Component
  Main content area displaying single rack
  v0.1.1: Single-rack mode - centered layout
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
  import RackDualView from "./RackDualView.svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";

  // Synthetic rack ID for single-rack mode
  const RACK_ID = "rack-0";

  interface Props {
    partyMode?: boolean;
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
  }

  let {
    partyMode = false,
    onnewrack,
    onload: _onload,
    onrackselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
  }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const canvasStore = getCanvasStore();
  const uiStore = getUIStore();

  // Single-rack mode: direct access to rack
  const rack = $derived(layoutStore.rack);
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
        canvasStore.fitAll(rack ? [rack] : []);
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
    selectionStore.selectRack(event.detail.rackId);
    onrackselect?.(event);
  }

  function handleDeviceSelect(
    event: CustomEvent<{ slug: string; position: number }>,
  ) {
    // Find the device by slug and position, then select by ID (UUID-based tracking)
    const currentRack = layoutStore.rack;
    if (currentRack) {
      const device = currentRack.devices.find(
        (d) =>
          d.device_type === event.detail.slug &&
          d.position === event.detail.position,
      );
      if (device) {
        selectionStore.selectDevice(RACK_ID, device.id);
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

  // NOTE: Rack reordering handlers removed in v0.1.1 (single-rack mode)
  // NOTE: handleRackViewChange removed in v0.4 (dual-view mode - always show both)
  // Restore in v0.3 when multi-rack support returns

  // Screen reader accessible description of rack contents
  const rackDescription = $derived.by(() => {
    if (!rack) return "No rack configured";
    const deviceCount = rack.devices.length;
    const deviceWord = deviceCount === 1 ? "device" : "devices";
    return `${rack.name}, ${rack.height}U rack with ${deviceCount} ${deviceWord} placed`;
  });

  const deviceListDescription = $derived.by(() => {
    if (!rack || rack.devices.length === 0) return "";
    const deviceNames = [...rack.devices]
      .sort((a, b) => b.position - a.position) // Top to bottom
      .map((d) => {
        const deviceType = layoutStore.device_types.find(
          (dt) => dt.slug === d.device_type,
        );
        const name = d.label || deviceType?.model || d.device_type;
        return `U${d.position}: ${name}`;
      });
    return `Devices from top to bottom: ${deviceNames.join(", ")}`;
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
  <!-- Hidden description for screen readers -->
  {#if deviceListDescription}
    <p id="canvas-device-list" class="sr-only">{deviceListDescription}</p>
  {/if}
  {#if hasRacks && rack}
    <div class="panzoom-container" bind:this={panzoomContainer}>
      <!-- Single-rack mode with dual-view: front and rear side-by-side (v0.4) -->
      <div class="rack-wrapper">
        <RackDualView
          {rack}
          deviceLibrary={layoutStore.device_types}
          selected={selectionStore.selectedType === "rack" &&
            selectionStore.selectedRackId === RACK_ID}
          selectedDeviceId={selectionStore.selectedType === "device" &&
          selectionStore.selectedRackId === RACK_ID
            ? selectionStore.selectedDeviceId
            : null}
          displayMode={uiStore.displayMode}
          showLabelsOnImages={uiStore.showLabelsOnImages}
          {partyMode}
          onselect={(e) => handleRackSelect(e)}
          ondeviceselect={(e) => handleDeviceSelect(e)}
          ondevicedrop={(e) => handleDeviceDrop(e)}
          ondevicemove={(e) => handleDeviceMove(e)}
          ondevicemoverack={(e) => handleDeviceMoveRack(e)}
        />
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

  .rack-wrapper {
    /* Single-rack mode: positioned at origin, panzoom controls viewport centering (v0.1.1) */
    /* Note: fitAll() in canvas store handles centering via pan calculations */
    display: inline-block;
    padding: var(--space-4);
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
