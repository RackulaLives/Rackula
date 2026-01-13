<!--
  Rack SVG Component
  Renders a rack visualization with U labels, grid lines, and selection state
  Accepts device drops for placement
-->
<script lang="ts">
  import type { Rack as RackType, DeviceType, DisplayMode } from "$lib/types";
  import RackDevice from "./RackDevice.svelte";
  import {
    parseDragData,
    calculateDropPosition,
    getDropFeedback,
    getCurrentDragData,
    type DropFeedback,
  } from "$lib/utils/dragdrop";
  import { findCollisions } from "$lib/utils/collision";
  import { getDeviceDisplayName } from "$lib/utils/device";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { screenToSVG } from "$lib/utils/coordinates";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getBlockedSlots } from "$lib/utils/blocked-slots";
  import { isChristmas } from "$lib/utils/christmas";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { hapticError, hapticCancel } from "$lib/utils/haptics";
  import { SvelteSet } from "svelte/reactivity";

  const canvasStore = getCanvasStore();
  const viewportStore = getViewportStore();
  const placementStore = getPlacementStore();
  const toastStore = getToastStore();
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  // Christmas easter egg
  const showChristmasHats = isChristmas();

  // Debounce delay to prevent click events firing immediately after drag ends
  const DRAG_CLICK_DEBOUNCE_MS = 100;

  interface Props {
    rack: RackType;
    deviceLibrary: DeviceType[];
    selected: boolean;
    /** ID of the selected device (UUID-based tracking, null if no device selected) */
    selectedDeviceId?: string | null;
    displayMode?: DisplayMode;
    showLabelsOnImages?: boolean;
    /** Filter devices by face - when set, overrides rack.view for filtering */
    faceFilter?: "front" | "rear";
    /** Label to show above the rack (e.g., "FRONT" or "REAR") */
    viewLabel?: string;
    /** Hide the rack name (useful when container shows it instead) */
    hideRackName?: boolean;
    /** Party mode visual effects active */
    partyMode?: boolean;
    onselect?: (event: CustomEvent<{ rackId: string }>) => void;
    ondeviceselect?: (
      event: CustomEvent<{ slug: string; position: number }>,
    ) => void;
    ondevicedrop?: (
      event: CustomEvent<{ rackId: string; slug: string; position: number }>,
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
    /** Mobile tap-to-place event (fires when rack is tapped during placement mode) */
    onplacementtap?: (
      event: CustomEvent<{ position: number; face: "front" | "rear" }>,
    ) => void;
  }

  let {
    rack,
    deviceLibrary,
    selected,
    selectedDeviceId = null,
    displayMode = "label",
    showLabelsOnImages = false,
    faceFilter,
    viewLabel,
    hideRackName = false,
    partyMode = false,
    onselect,
    ondeviceselect,
    ondevicedrop,
    ondevicemove,
    ondevicemoverack,
    onplacementtap,
  }: Props = $props();

  // Track which device is being dragged (for internal moves)
  let _draggingDeviceIndex = $state<number | null>(null);
  // Track if we just finished dragging a device (to prevent rack selection on release)
  let justFinishedDrag = $state(false);
  // Track Shift key state for fine-positioning mode
  let shiftKeyHeld = $state(false);

  // Look up device by device_type (slug)
  function getDeviceBySlug(slug: string): DeviceType | undefined {
    return deviceLibrary.find((d) => d.slug === slug);
  }

  // CSS custom property values (fallbacks match app.css)
  const U_HEIGHT = 22;
  const BASE_RACK_WIDTH = 220; // Base width for 19" rack
  const RAIL_WIDTH = 17;
  const BASE_RACK_PADDING = 18; // Space at top for rack name (13px font + margin)
  const NAME_Y_OFFSET = 4; // Extra space above rack name to prevent cutoff on narrow racks

  // Calculate actual width based on rack.width (10" or 19")
  // Scale proportionally: 10" rack = 220 * 10/19 ≈ 116
  const RACK_WIDTH = $derived(Math.round((BASE_RACK_WIDTH * rack.width) / 19));

  // Rack padding is reduced when rack name is hidden (in dual-view mode)
  const RACK_PADDING = $derived(hideRackName ? 4 : BASE_RACK_PADDING);

  // Calculated dimensions
  const totalHeight = $derived(rack.height * U_HEIGHT);
  // viewBoxHeight includes: rack name padding + top bar + U slots + bottom bar
  const viewBoxHeight = $derived(RACK_PADDING + RAIL_WIDTH * 2 + totalHeight);
  const interiorWidth = $derived(RACK_WIDTH - RAIL_WIDTH * 2);

  // Drop preview state
  let dropPreview = $state<{
    position: number;
    height: number;
    feedback: DropFeedback;
  } | null>(null);

  // Generate U labels based on desc_units and starting_unit
  // When desc_units=false (default): U1 at bottom, numbers increase upward
  // When desc_units=true: U1 at top, numbers increase downward
  const uLabels = $derived(
    Array.from({ length: rack.height }, (_, i) => {
      const startUnit = rack.starting_unit ?? 1;
      const uNumber = rack.desc_units
        ? startUnit + i // Descending: lowest number at top
        : startUnit + (rack.height - 1) - i; // Ascending: highest number at top
      const yPosition = i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING + RAIL_WIDTH;
      return { uNumber, yPosition };
    }),
  );

  // Calculate drop preview Y position (SVG coordinate)
  const dropPreviewY = $derived(
    dropPreview
      ? (rack.height - dropPreview.position - dropPreview.height + 1) *
          U_HEIGHT +
          RACK_PADDING +
          RAIL_WIDTH
      : 0,
  );

  // Filter devices by face - use faceFilter prop if provided, otherwise fall back to rack.view
  const effectiveFaceFilter = $derived(faceFilter ?? rack.view);

  // Filter devices by face and preserve original indices for selection tracking
  // The face field on PlacedDevice is the source of truth for which face(s) a device occupies.
  // - face="both": device shows on both front and rear (default for full-depth devices)
  // - face="front": device only shows on front view
  // - face="rear": device only shows on rear view
  // Note: is_full_depth on DeviceType only affects default face assignment and collision detection,
  // it does NOT override the user's explicit face selection (Issue #383).
  const visibleDevices = $derived(
    rack.devices
      .map((placedDevice, originalIndex) => ({ placedDevice, originalIndex }))
      .filter(({ placedDevice }) => {
        const { face } = placedDevice;
        // Both-face devices visible in all views
        if (face === "both") return true;
        // Devices on this face are always visible
        if (face === effectiveFaceFilter) return true;
        // Otherwise, device is on the opposite face and not "both", so not visible
        return false;
      }),
  );

  // Calculate blocked slots for this view (only when faceFilter is set)
  const blockedSlots = $derived(
    faceFilter ? getBlockedSlots(rack, faceFilter, deviceLibrary) : [],
  );

  // Check if we're in mobile placement mode
  const isPlacementMode = $derived(
    viewportStore.isMobile && placementStore.isPlacing,
  );

  // Calculate which U positions are valid for placing the pending device
  const validPlacementSlots = $derived.by(() => {
    if (!isPlacementMode || !placementStore.pendingDevice)
      return new SvelteSet<number>();

    const device = placementStore.pendingDevice;
    const deviceHeight = device.u_height;
    const validSlots = new SvelteSet<number>();

    // Check each potential starting position
    for (let startU = 1; startU <= rack.height - deviceHeight + 1; startU++) {
      const feedback = getDropFeedback(
        rack,
        deviceLibrary,
        deviceHeight,
        startU,
        undefined,
        effectiveFaceFilter,
      );
      if (feedback === "valid") {
        // Mark all U positions this device would occupy as valid
        for (let u = startU; u < startU + deviceHeight; u++) {
          validSlots.add(u);
        }
      }
    }
    return validSlots;
  });

  // Reference to the SVG element for coordinate conversion
  let svgElement: SVGSVGElement | null = $state(null);

  // Listen for custom pointer-based drag events from RackDevice (fixes Safari #397)
  $effect(() => {
    function handleDragMove(event: CustomEvent) {
      if (!svgElement) return;
      const { clientX, clientY, device } = event.detail;

      // Determine if this is an internal move (same rack)
      const isInternalMove = event.detail.rackId === rack.id;

      // Calculate target position using transform-aware coordinates
      const svgCoords = screenToSVG(svgElement, clientX, clientY);
      const mouseY = svgCoords.y - RACK_PADDING;

      const targetU = calculateDropPosition(
        mouseY,
        rack.height,
        U_HEIGHT,
        RACK_PADDING,
      );

      // For internal moves, exclude the source device from collision checks
      const excludeIndex = isInternalMove
        ? event.detail.deviceIndex
        : undefined;
      const feedback = getDropFeedback(
        rack,
        deviceLibrary,
        device.u_height,
        targetU,
        excludeIndex,
        effectiveFaceFilter,
      );

      dropPreview = {
        position: targetU,
        height: device.u_height,
        feedback,
      };
    }

    function handleDragEnd(event: CustomEvent) {
      if (!svgElement) return;
      const {
        clientX,
        clientY,
        device,
        rackId: sourceRackId,
        deviceIndex,
      } = event.detail;

      // Clear preview
      dropPreview = null;
      _draggingDeviceIndex = null;

      // Determine if this is an internal move (cross-rack is simply !isInternalMove)
      const isInternalMove = sourceRackId === rack.id;

      // Calculate target position
      const svgCoords = screenToSVG(svgElement, clientX, clientY);
      const mouseY = svgCoords.y - RACK_PADDING;

      const targetU = calculateDropPosition(
        mouseY,
        rack.height,
        U_HEIGHT,
        RACK_PADDING,
      );

      // Validate placement
      const excludeIndex = isInternalMove ? deviceIndex : undefined;
      const feedback = getDropFeedback(
        rack,
        deviceLibrary,
        device.u_height,
        targetU,
        excludeIndex,
        effectiveFaceFilter,
      );

      if (feedback === "valid") {
        if (isInternalMove && deviceIndex !== undefined) {
          // Internal move within same rack
          ondevicemove?.(
            new CustomEvent("devicemove", {
              detail: {
                rackId: rack.id,
                deviceIndex: deviceIndex,
                newPosition: targetU,
              },
            }),
          );
        } else if (!isInternalMove && deviceIndex !== undefined) {
          // Cross-rack move
          ondevicemoverack?.(
            new CustomEvent("devicemoverack", {
              detail: {
                sourceRackId: sourceRackId,
                sourceIndex: deviceIndex,
                targetRackId: rack.id,
                targetPosition: targetU,
              },
            }),
          );
        }
      } else {
        // Invalid placement - haptic feedback
        hapticError();
      }

      // Set flag to prevent rack selection on the click that follows
      justFinishedDrag = true;
      setTimeout(() => {
        justFinishedDrag = false;
      }, DRAG_CLICK_DEBOUNCE_MS);
    }

    // Add listeners
    document.addEventListener(
      "rackula:dragmove",
      handleDragMove as EventListener,
    );
    document.addEventListener(
      "rackula:dragend",
      handleDragEnd as EventListener,
    );

    // Cleanup
    return () => {
      document.removeEventListener(
        "rackula:dragmove",
        handleDragMove as EventListener,
      );
      document.removeEventListener(
        "rackula:dragend",
        handleDragEnd as EventListener,
      );
    };
  });

  // Handle cancel placement when tapping outside rack content
  function handleCancelPlacement() {
    hapticCancel();
    placementStore.cancelPlacement();
    // Reset view to show full rack after placement is cancelled
    canvasStore.fitAll(layoutStore.racks);
  }

  function handleClick(_event: MouseEvent) {
    // Don't select rack if we just finished panning
    if (canvasStore.isPanning) return;
    // Don't select rack if we just finished dragging a device
    if (justFinishedDrag) {
      justFinishedDrag = false;
      return;
    }

    onselect?.(new CustomEvent("select", { detail: { rackId: rack.id } }));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onselect?.(new CustomEvent("select", { detail: { rackId: rack.id } }));
    }
  }

  /**
   * Handle touch end events for mobile tap-to-place workflow.
   * Only active when on mobile viewport and in placement mode.
   */
  function handleTouchEnd(event: TouchEvent) {
    // Only handle in mobile placement mode
    if (!viewportStore.isMobile || !placementStore.isPlacing) return;

    const device = placementStore.pendingDevice;
    if (!device) return;

    // Prevent default to avoid triggering click events
    event.preventDefault();

    const touch = event.changedTouches[0];
    if (!touch) return;

    // Get SVG element and convert touch coordinates to SVG space
    const svg = event.currentTarget as SVGSVGElement;
    const svgCoords = screenToSVG(svg, touch.clientX, touch.clientY);
    const mouseY = svgCoords.y - RACK_PADDING;

    // Calculate target U position
    const targetU = calculateDropPosition(
      mouseY,
      rack.height,
      U_HEIGHT,
      RACK_PADDING,
    );

    // Validate placement
    const feedback = getDropFeedback(
      rack,
      deviceLibrary,
      device.u_height,
      targetU,
      undefined,
      effectiveFaceFilter,
    );

    if (feedback === "valid") {
      // Fire placement tap event
      onplacementtap?.(
        new CustomEvent("placementtap", {
          detail: { position: targetU, face: effectiveFaceFilter ?? "front" },
        }),
      );
    } else {
      // Invalid placement - provide haptic feedback
      hapticError();
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer) return;

    // Try dataTransfer first (works in drop), fall back to shared state (needed for dragover)
    let dragData = parseDragData(
      event.dataTransfer.getData("application/json"),
    );
    if (!dragData) {
      // getData() blocked during dragover in most browsers - use shared state
      dragData = getCurrentDragData();
    }
    if (!dragData) return;

    // Determine if this is an internal move (same rack)
    const isInternalMove =
      dragData.type === "rack-device" &&
      dragData.sourceRackId === rack.id &&
      dragData.sourceIndex !== undefined;

    event.dataTransfer.dropEffect = isInternalMove ? "move" : "copy";

    // Calculate target position from mouse Y using transform-aware coordinates
    const svg = event.currentTarget as SVGSVGElement;
    const svgCoords = screenToSVG(svg, event.clientX, event.clientY);
    const mouseY = svgCoords.y - RACK_PADDING;

    const targetU = calculateDropPosition(
      mouseY,
      rack.height,
      U_HEIGHT,
      RACK_PADDING,
    );

    // For internal moves, exclude the source device from collision checks
    const excludeIndex = isInternalMove ? dragData.sourceIndex : undefined;
    const feedback = getDropFeedback(
      rack,
      deviceLibrary,
      dragData.device.u_height,
      targetU,
      excludeIndex,
      effectiveFaceFilter,
    );

    dropPreview = {
      position: targetU,
      height: dragData.device.u_height,
      feedback,
    };
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent) {
    // Only clear if leaving the SVG entirely
    const svg = event.currentTarget as SVGElement;
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !svg.contains(relatedTarget)) {
      dropPreview = null;
    }
  }

  function handleDeviceDragStart(deviceIndex: number) {
    _draggingDeviceIndex = deviceIndex;
  }

  function handleDeviceDragEnd() {
    _draggingDeviceIndex = null;
    // Set flag to prevent rack selection on the click that follows drag end
    justFinishedDrag = true;
    // Reset the flag after a short delay (in case no click event follows)
    setTimeout(() => {
      justFinishedDrag = false;
    }, DRAG_CLICK_DEBOUNCE_MS);
  }

  /**
   * Handle device duplication (triggered by right-click context menu)
   */
  function handleDeviceDuplicate(
    event: CustomEvent<{ rackId: string; deviceIndex: number }>,
  ) {
    const { rackId, deviceIndex } = event.detail;
    const result = layoutStore.duplicateDevice(rackId, deviceIndex);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.device) {
      // Select the newly duplicated device
      selectionStore.selectDevice(rackId, result.device.id);
      toastStore.showToast("Device duplicated", "success");
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dropPreview = null;
    _draggingDeviceIndex = null;

    if (!event.dataTransfer) return;

    const data = event.dataTransfer.getData("application/json");
    const dragData = parseDragData(data);
    if (!dragData) return;

    // Determine if this is an internal move (same rack)
    const isInternalMove =
      dragData.type === "rack-device" &&
      dragData.sourceRackId === rack.id &&
      dragData.sourceIndex !== undefined;

    // Determine if this is a cross-rack move (from different rack)
    const isCrossRackMove =
      dragData.type === "rack-device" &&
      dragData.sourceRackId !== rack.id &&
      dragData.sourceIndex !== undefined;

    // Calculate target position using transform-aware coordinates
    const svg = event.currentTarget as SVGSVGElement;
    const svgCoords = screenToSVG(svg, event.clientX, event.clientY);
    const mouseY = svgCoords.y - RACK_PADDING;

    const targetU = calculateDropPosition(
      mouseY,
      rack.height,
      U_HEIGHT,
      RACK_PADDING,
    );

    // For internal moves, exclude the source device from collision checks
    // Cross-rack and palette drops don't need exclusion
    const excludeIndex = isInternalMove ? dragData.sourceIndex : undefined;
    const feedback = getDropFeedback(
      rack,
      deviceLibrary,
      dragData.device.u_height,
      targetU,
      excludeIndex,
      effectiveFaceFilter,
    );

    if (feedback === "valid") {
      if (isInternalMove && dragData.sourceIndex !== undefined) {
        // Internal move within same rack
        ondevicemove?.(
          new CustomEvent("devicemove", {
            detail: {
              rackId: rack.id,
              deviceIndex: dragData.sourceIndex,
              newPosition: targetU,
            },
          }),
        );
      } else if (
        isCrossRackMove &&
        dragData.sourceIndex !== undefined &&
        dragData.sourceRackId
      ) {
        // Cross-rack move from a different rack
        ondevicemoverack?.(
          new CustomEvent("devicemoverack", {
            detail: {
              sourceRackId: dragData.sourceRackId,
              sourceIndex: dragData.sourceIndex,
              targetRackId: rack.id,
              targetPosition: targetU,
            },
          }),
        );
      } else {
        // External drop from palette (library-device type)
        ondevicedrop?.(
          new CustomEvent("devicedrop", {
            detail: {
              rackId: rack.id,
              slug: dragData.device.slug,
              position: targetU,
            },
          }),
        );
      }
    } else {
      // Drop failed - show toast with reason
      if (feedback === "blocked") {
        // Find colliding devices
        const collisions = findCollisions(
          rack,
          deviceLibrary,
          dragData.device.u_height,
          targetU,
          excludeIndex,
          effectiveFaceFilter,
        );

        if (collisions.length > 0) {
          // Build list of blocking device names using the helper function
          const blockingNames = collisions.map((placed) =>
            getDeviceDisplayName(placed, deviceLibrary),
          );

          // Format message based on number of collisions
          const message =
            blockingNames.length === 1
              ? `Position blocked by ${blockingNames[0]}`
              : `Position blocked by ${blockingNames.join(", ")}`;

          toastStore.showToast(message, "warning", 3000);
        }
      } else if (feedback === "invalid") {
        toastStore.showToast(
          "Device doesn't fit at this position",
          "warning",
          3000,
        );
      }
    }
  }

  // NOTE: Rack drag handle for reordering removed in v0.1.1 (single-rack mode)
  // Restore in v0.3 when multi-rack support returns

  function handleShiftDown(event: KeyboardEvent) {
    if (event.key === "Shift") {
      shiftKeyHeld = true;
    }
  }

  function handleShiftUp(event: KeyboardEvent) {
    if (event.key === "Shift") {
      shiftKeyHeld = false;
    }
  }
</script>

<svelte:window onkeydown={handleShiftDown} onkeyup={handleShiftUp} />

<div
  class="rack-container"
  class:selected
  class:party-mode={partyMode}
  class:placement-mode={isPlacementMode}
  tabindex="0"
  aria-selected={selected}
  role="option"
  onkeydown={handleKeyDown}
  onclick={handleClick}
>
  <!-- NOTE: Drag handle removed in v0.1.1 (single-rack mode) -->
  <svg
    bind:this={svgElement}
    class="rack-svg"
    width={RACK_WIDTH}
    height={viewBoxHeight + NAME_Y_OFFSET}
    viewBox="0 -{NAME_Y_OFFSET} {RACK_WIDTH} {viewBoxHeight + NAME_Y_OFFSET}"
    role="img"
    aria-label="{rack.name}, {rack.height}U rack{selected ? ', selected' : ''}"
    ondragover={handleDragOver}
    ondragenter={handleDragEnter}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    ontouchend={handleTouchEnd}
    style="overflow: visible"
  >
    <!-- Rack background (interior) -->
    <rect
      x={RAIL_WIDTH}
      y={RACK_PADDING + RAIL_WIDTH}
      width={interiorWidth}
      height={totalHeight}
      class="rack-interior"
    />

    <!-- Top bar (horizontal) -->
    <rect
      x="0"
      y={RACK_PADDING}
      width={RACK_WIDTH}
      height={RAIL_WIDTH}
      class="rack-rail"
    />

    <!-- Bottom bar (horizontal) -->
    <rect
      x="0"
      y={RACK_PADDING + RAIL_WIDTH + totalHeight}
      width={RACK_WIDTH}
      height={RAIL_WIDTH}
      class="rack-rail"
    />

    <!-- Left rail (vertical) -->
    <rect
      x="0"
      y={RACK_PADDING + RAIL_WIDTH}
      width={RAIL_WIDTH}
      height={totalHeight}
      class="rack-rail"
    />

    <!-- Right rail (vertical) -->
    <rect
      x={RACK_WIDTH - RAIL_WIDTH}
      y={RACK_PADDING + RAIL_WIDTH}
      width={RAIL_WIDTH}
      height={totalHeight}
      class="rack-rail"
    />

    <!-- U slot backgrounds (for drop zone highlighting) -->
    {#each Array(rack.height).fill(null) as _slot, i (i)}
      {@const uPosition = rack.height - i}
      {@const isDropTarget =
        dropPreview !== null &&
        uPosition >= dropPreview.position &&
        uPosition < dropPreview.position + dropPreview.height}
      {@const isPlacementValid =
        isPlacementMode && validPlacementSlots.has(uPosition)}
      <rect
        class="u-slot"
        class:u-slot-even={uPosition % 2 === 0}
        class:drop-target={isDropTarget}
        class:drop-valid={isDropTarget && dropPreview?.feedback === "valid"}
        class:drop-invalid={isDropTarget &&
          (dropPreview?.feedback === "invalid" ||
            dropPreview?.feedback === "blocked")}
        class:placement-valid={isPlacementValid}
        x={RAIL_WIDTH}
        y={i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH}
        width={interiorWidth}
        height={U_HEIGHT}
      />
    {/each}

    <!-- Horizontal grid lines (U dividers) -->
    {#each Array(rack.height + 1).fill(null) as _gridLine, i (i)}
      <line
        x1={RAIL_WIDTH}
        y1={i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH}
        x2={RACK_WIDTH - RAIL_WIDTH}
        y2={i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH}
        class="rack-grid-line"
      />
    {/each}

    <!-- Half-U grid lines (shown when Shift is held for fine positioning) -->
    {#if shiftKeyHeld}
      {#each Array(rack.height).fill(null) as _halfLine, i (i)}
        <line
          x1={RAIL_WIDTH}
          y1={i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING + RAIL_WIDTH}
          x2={RACK_WIDTH - RAIL_WIDTH}
          y2={i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING + RAIL_WIDTH}
          class="rack-grid-line-half"
        />
      {/each}
    {/if}

    <!-- Rail mounting holes (3 per U on each rail) - rendered first so labels appear on top -->
    {#each Array(rack.height).fill(null) as _hole, i (i)}
      {@const baseY = i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH + 4}
      {@const leftHoleX = RAIL_WIDTH - 4}
      {@const rightHoleX = RACK_WIDTH - RAIL_WIDTH + 1}
      <!-- Left rail holes (behind U labels) -->
      <rect
        x={leftHoleX}
        y={baseY - 2}
        width="3"
        height="4"
        rx="0.5"
        class="rack-hole"
      />
      <rect
        x={leftHoleX}
        y={baseY + 5}
        width="3"
        height="4"
        rx="0.5"
        class="rack-hole"
      />
      <rect
        x={leftHoleX}
        y={baseY + 12}
        width="3"
        height="4"
        rx="0.5"
        class="rack-hole"
      />
      <!-- Right rail holes -->
      <rect
        x={rightHoleX}
        y={baseY - 2}
        width="3"
        height="4"
        rx="0.5"
        class="rack-hole"
      />
      <rect
        x={rightHoleX}
        y={baseY + 5}
        width="3"
        height="4"
        rx="0.5"
        class="rack-hole"
      />
      <rect
        x={rightHoleX}
        y={baseY + 12}
        width="3"
        height="4"
        rx="0.5"
        class="rack-hole"
      />
    {/each}

    <!-- U labels (always on left rail) -->
    {#each uLabels as { uNumber, yPosition } (uNumber)}
      <text
        x={RAIL_WIDTH / 2}
        y={yPosition}
        class="u-label"
        class:u-label-highlight={uNumber % 5 === 0}
        dominant-baseline="middle"
      >
        {uNumber}
      </text>
    {/each}

    <!-- SVG Defs for blocked slots pattern -->
    <defs>
      <!-- Crosshatch pattern for blocked slots - uses two overlapping diagonal line sets
           for better visibility and accessibility (not relying solely on color) -->
      <pattern
        id="blocked-crosshatch-pattern"
        patternUnits="userSpaceOnUse"
        width="8"
        height="8"
      >
        <!-- First diagonal (top-left to bottom-right) -->
        <line
          x1="0"
          y1="0"
          x2="8"
          y2="8"
          class="blocked-crosshatch-line"
          stroke-width="1.5"
        />
        <!-- Second diagonal (top-right to bottom-left) -->
        <line
          x1="8"
          y1="0"
          x2="0"
          y2="8"
          class="blocked-crosshatch-line"
          stroke-width="1.5"
        />
      </pattern>

      <!-- Arrow symbol pointing to indicate device is on opposite face -->
      <symbol id="blocked-arrow-icon" viewBox="0 0 16 16">
        <!-- Horizontal line -->
        <line
          x1="2"
          y1="8"
          x2="14"
          y2="8"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
        <!-- Arrow head -->
        <polyline
          points="9,4 14,8 9,12"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </symbol>
    </defs>

    <!-- Blocked Slots Overlay (renders before devices so devices appear on top) -->
    {#if blockedSlots.length > 0}
      {@const slotHeight = (slot: { bottom: number; top: number }) =>
        (slot.top - slot.bottom + 1) * U_HEIGHT}
      {@const slotY = (slot: { bottom: number; top: number }) =>
        (rack.height - slot.top) * U_HEIGHT}
      {@const slotWidth = RACK_WIDTH - 2 * RAIL_WIDTH}
      {@const iconSize = 14}
      <g
        class="blocked-slots-layer"
        transform="translate(0, {RACK_PADDING + RAIL_WIDTH})"
      >
        {#each blockedSlots as slot (slot.bottom + "-" + slot.top)}
          <!-- Background wash with improved opacity -->
          <rect
            class="blocked-slot blocked-slot-bg"
            x={RAIL_WIDTH}
            y={slotY(slot)}
            width={slotWidth}
            height={slotHeight(slot)}
          />
          <!-- Crosshatch pattern for accessibility (visual texture, not just color) -->
          <rect
            class="blocked-slot blocked-slot-pattern"
            x={RAIL_WIDTH}
            y={slotY(slot)}
            width={slotWidth}
            height={slotHeight(slot)}
            fill="url(#blocked-crosshatch-pattern)"
          />
          <!-- Directional arrow icon indicating device is on opposite face.
               Arrow points right for front view (device on rear),
               arrow points left for rear view (device on front).
               Centered vertically in the blocked slot area. -->
          <use
            href="#blocked-arrow-icon"
            class="blocked-slot-icon"
            x={RAIL_WIDTH + slotWidth / 2 - iconSize / 2}
            y={slotY(slot) + slotHeight(slot) / 2 - iconSize / 2}
            width={iconSize}
            height={iconSize}
            transform={faceFilter === "rear"
              ? `rotate(180, ${RAIL_WIDTH + slotWidth / 2}, ${slotY(slot) + slotHeight(slot) / 2})`
              : ""}
          />
        {/each}
      </g>
    {/if}

    <!-- Devices -->
    <g transform="translate(0, {RACK_PADDING + RAIL_WIDTH})">
      {#each visibleDevices as { placedDevice, originalIndex } (placedDevice.device_type + "-" + placedDevice.position)}
        {@const device = getDeviceBySlug(placedDevice.device_type)}
        {#if device}
          <RackDevice
            {device}
            position={placedDevice.position}
            rackHeight={rack.height}
            rackId={rack.id}
            deviceIndex={originalIndex}
            selected={selectedDeviceId === placedDevice.id}
            uHeight={U_HEIGHT}
            rackWidth={RACK_WIDTH}
            {displayMode}
            rackView={effectiveFaceFilter}
            {showLabelsOnImages}
            placedDeviceName={placedDevice.name}
            placedDeviceId={placedDevice.id}
            colourOverride={placedDevice.colour_override}
            slotPosition={placedDevice.slot_position}
            onselect={ondeviceselect}
            ondragstart={() => handleDeviceDragStart(originalIndex)}
            ondragend={handleDeviceDragEnd}
            onduplicate={handleDeviceDuplicate}
          />
        {/if}
      {/each}
    </g>

    <!-- Drop preview -->
    {#if dropPreview}
      <rect
        x={RAIL_WIDTH + 2}
        y={dropPreviewY}
        width={interiorWidth - 4}
        height={dropPreview.height * U_HEIGHT - 2}
        class="drop-preview"
        class:drop-valid={dropPreview.feedback === "valid"}
        class:drop-invalid={dropPreview.feedback === "invalid"}
        class:drop-blocked={dropPreview.feedback === "blocked"}
        rx="2"
        ry="2"
      />
    {/if}

    <!-- Rack name at top (rendered last so it's on top) - hidden when hideRackName=true -->
    {#if !hideRackName}
      <text
        x={RACK_WIDTH / 2}
        y={-NAME_Y_OFFSET + 20}
        class="rack-name"
        text-anchor="middle"
        dominant-baseline="text-before-edge"
      >
        {rack.name}
      </text>
    {/if}

    <!-- View label (e.g., "FRONT" or "REAR") - shown when viewLabel is provided, positioned on top rail -->
    {#if viewLabel}
      <text
        x={RACK_WIDTH / 2}
        y={RACK_PADDING + RAIL_WIDTH / 2}
        class="rack-view-label"
        text-anchor="middle"
        dominant-baseline="central"
      >
        {viewLabel}
      </text>
    {/if}

    <!-- Placement mode header - shown when in mobile placement mode
         NOTE: This foreignObject is safe to keep as-is for Safari compatibility.
         Unlike RackDevice's label overlay, this element is NOT inside a transformed
         <g> element - it's a direct child of the root <svg> with explicit x/y coords.
         Safari's foreignObject transform inheritance bug (WebKit #230304) only affects
         foreignObjects inside transformed <g> elements. See #420 for audit details. -->
    {#if isPlacementMode && placementStore.pendingDevice}
      <foreignObject
        x="0"
        y={RACK_PADDING}
        width={RACK_WIDTH}
        height="24"
        class="placement-header-container"
      >
        <div
          class="placement-header"
          role="status"
          aria-live="polite"
          xmlns="http://www.w3.org/1999/xhtml"
        >
          <span class="placement-text">
            Tap to place: <strong>{placementStore.pendingDevice.model}</strong>
          </span>
          <button
            type="button"
            class="placement-cancel"
            onclick={handleCancelPlacement}
            aria-label="Cancel placement"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </foreignObject>
    {/if}

    <!-- Christmas Santa hat (front view only, rendered last to appear on top of name) -->
    {#if showChristmasHats && effectiveFaceFilter === "front"}
      <g
        transform="translate({-24}, {RACK_PADDING -
          85}) rotate(-18, 45, 75) scale(1.35)"
      >
        <!-- Shadow -->
        <ellipse cx="40" cy="68" rx="26" ry="5" fill="rgba(0,0,0,0.12)" />
        <!-- Hat body - tapered cone -->
        <path d="M14 65 L36 15 L44 15 L66 65 Z" fill="#E63946" />
        <path d="M18 65 L37 18 L43 18 L62 65 Z" fill="#FF5555" />
        <!-- White fur trim -->
        <rect x="8" y="60" width="64" height="14" rx="7" fill="#F1F1F1" />
        <rect x="10" y="62" width="60" height="10" rx="5" fill="#FFFFFF" />
        <!-- Pom-pom - connected to tip -->
        <circle cx="40" cy="15" r="10" fill="#F1F1F1" />
        <circle cx="40" cy="15" r="8" fill="#FFFFFF" />
      </g>
    {/if}
  </svg>
</div>

<style>
  .rack-container {
    display: inline-block;
    position: relative;
    cursor: inherit; /* Inherit cursor from panzoom-container (grab/grabbing) */
    touch-action: inherit; /* Allow panzoom to handle touches */
  }

  .rack-container:focus {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .rack-container[aria-selected="true"] {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .rack-container.selected {
    outline: 2px solid var(--colour-selection);
    outline-offset: 4px;
  }

  /* NOTE: Drag handle CSS removed in v0.1.1 (single-rack mode) */
  /* NOTE: View toggle CSS removed in v0.4.0 (dual-view mode) */

  svg {
    pointer-events: auto;
    touch-action: inherit; /* Allow panzoom to handle touches */
  }

  .rack-interior {
    fill: var(--rack-interior);
  }

  /* U slot backgrounds */
  .u-slot {
    fill: var(--rack-slot);
    transition: fill var(--duration-fast) var(--ease-out);
  }

  .u-slot.u-slot-even {
    fill: var(--rack-slot-alt);
  }

  .u-slot.drop-target {
    transition: fill var(--duration-fast) var(--ease-out);
  }

  .u-slot.drop-target.drop-valid {
    fill: var(--colour-dnd-valid-bg);
  }

  .u-slot.drop-target.drop-invalid {
    fill: var(--colour-dnd-invalid-bg);
  }

  .rack-rail {
    fill: var(--rack-rail);
  }

  .rack-grid-line {
    stroke: var(--rack-grid);
    stroke-width: 1;
  }

  .rack-grid-line-half {
    stroke: var(--colour-selection);
    stroke-width: 1;
    stroke-dasharray: 4 2;
    opacity: 0.6;
  }

  .u-label {
    fill: var(--rack-text);
    font-size: var(--font-size-2xs);
    text-anchor: middle;
    font-family: var(--font-mono, monospace);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .u-label-highlight {
    font-weight: var(--font-weight-semibold, 600);
    fill: var(--rack-text-highlight);
  }

  .rack-hole {
    fill: var(--rack-grid);
  }

  .rack-name {
    fill: var(--colour-text);
    font-size: var(--font-size-base);
    font-weight: 500;
    text-anchor: middle;
    font-family: var(--font-family, system-ui, sans-serif);
  }

  .rack-view-label {
    fill: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-anchor: middle;
    font-family: var(--font-family, system-ui, sans-serif);
  }

  .drop-preview {
    pointer-events: none;
    stroke-dasharray: 4 2;
    opacity: 0.8;
  }

  .drop-valid {
    fill: var(--colour-dnd-valid-bg);
    stroke: var(--colour-dnd-valid);
    stroke-width: 2;
  }

  .drop-invalid {
    fill: var(--colour-dnd-invalid-bg);
    stroke: var(--colour-dnd-invalid);
    stroke-width: 2;
  }

  .drop-blocked {
    fill: var(--colour-dnd-invalid-bg);
    stroke: var(--colour-dnd-invalid);
    stroke-width: 2;
  }

  /* Blocked Slots - Crosshatch pattern for half-depth conflicts
     Uses both pattern and color for accessibility (WCAG: not relying solely on color) */
  .blocked-crosshatch-line {
    stroke: var(--colour-blocked-stroke, rgba(239, 68, 68, 0.45));
  }

  .blocked-slot-bg {
    fill: var(--colour-blocked-bg, rgba(239, 68, 68, 0.12));
  }

  .blocked-slot-pattern {
    pointer-events: none;
    opacity: 0.9;
  }

  /* Arrow icon indicating device is on opposite face */
  .blocked-slot-icon {
    color: var(--colour-blocked-icon, rgba(239, 68, 68, 0.7));
    pointer-events: none;
    opacity: 0.85;
  }

  /* Party mode: rainbow glow animation */
  @keyframes party-glow {
    0% {
      filter: drop-shadow(0 0 8px hsl(0, 100%, 50%));
    }
    25% {
      filter: drop-shadow(0 0 8px hsl(90, 100%, 50%));
    }
    50% {
      filter: drop-shadow(0 0 8px hsl(180, 100%, 50%));
    }
    75% {
      filter: drop-shadow(0 0 8px hsl(270, 100%, 50%));
    }
    100% {
      filter: drop-shadow(0 0 8px hsl(360, 100%, 50%));
    }
  }

  .rack-container.party-mode .rack-svg {
    animation: party-glow 3s linear infinite;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .rack-container.party-mode .rack-svg {
      animation: none;
      filter: drop-shadow(0 0 8px hsl(300, 100%, 50%));
    }
  }

  /* ==========================================================================
     PLACEMENT MODE STYLES
     Mobile tap-to-place visual feedback
     ========================================================================== */

  /* Rack glow when in placement mode */
  .rack-container.placement-mode {
    outline: 2px solid var(--dracula-pink, #ff79c6);
    outline-offset: 4px;
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 0 20px rgba(255, 121, 198, 0.3);
    transition:
      outline var(--duration-fast, 150ms) var(--ease-out),
      box-shadow var(--duration-fast, 150ms) var(--ease-out);
  }

  /* Valid placement slots - subtle pulse highlight */
  .u-slot.placement-valid {
    fill: rgba(255, 121, 198, 0.15);
    animation: placement-pulse 2s ease-in-out infinite;
  }

  @keyframes placement-pulse {
    0%,
    100% {
      fill: rgba(255, 121, 198, 0.1);
    }
    50% {
      fill: rgba(255, 121, 198, 0.25);
    }
  }

  /* Placement header - foreignObject container */
  .placement-header-container {
    overflow: visible;
  }

  /* Placement header bar */
  .placement-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    background: rgba(40, 42, 54, 0.95);
    border-bottom: 1px solid var(--dracula-pink, #ff79c6);
    font-family: var(--font-family, system-ui, sans-serif);
    font-size: 11px;
    color: var(--dracula-foreground, #f8f8f2);
    box-sizing: border-box;
  }

  .placement-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placement-text strong {
    color: var(--dracula-pink, #ff79c6);
    font-weight: 600;
  }

  .placement-cancel {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--dracula-foreground, #f8f8f2);
    cursor: pointer;
    transition: background-color 150ms;
    /* Expand touch target */
    position: relative;
  }

  .placement-cancel::before {
    content: "";
    position: absolute;
    inset: -14px -10px;
  }

  .placement-cancel:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .placement-cancel:active {
    background: rgba(255, 255, 255, 0.2);
  }

  /* Respect reduced motion - no pulse */
  @media (prefers-reduced-motion: reduce) {
    .u-slot.placement-valid {
      animation: none;
      fill: rgba(255, 121, 198, 0.2);
    }

    .rack-container.placement-mode {
      transition: none;
    }
  }
</style>
