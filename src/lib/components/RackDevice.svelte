<!--
  RackDevice SVG Component
  Renders a device within a rack at the specified U position
-->
<script lang="ts">
  import type {
    DeviceType,
    DisplayMode,
    InterfaceTemplate,
    RackView,
    SlotPosition,
  } from "$lib/types";
  import PortIndicators from "./PortIndicators.svelte";
  import {
    createRackDeviceDragData,
    setCurrentDragData,
  } from "$lib/utils/dragdrop";
  import {
    showDragTooltip,
    updateDragTooltipPosition,
    hideDragTooltip,
  } from "$lib/stores/dragTooltip.svelte";
  import CategoryIconSVG from "./CategoryIconSVG.svelte";
  import LabelOverlaySVG from "./LabelOverlaySVG.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { useLongPress } from "$lib/utils/gestures";
  import { RAIL_WIDTH } from "$lib/constants/layout";
  import {
    fitTextToWidth,
    DEVICE_LABEL_MAX_FONT,
    DEVICE_LABEL_MIN_FONT,
    DEVICE_LABEL_IMAGE_MAX_FONT,
    DEVICE_LABEL_ICON_SPACE_LEFT,
    DEVICE_LABEL_ICON_SPACE_RIGHT,
  } from "$lib/utils/text-sizing";

  interface Props {
    device: DeviceType;
    position: number;
    rackHeight: number;
    rackId: string;
    deviceIndex: number;
    selected: boolean;
    uHeight: number;
    rackWidth: number;
    displayMode?: DisplayMode;
    rackView?: RackView;
    showLabelsOnImages?: boolean;
    placedDeviceName?: string;
    placedDeviceId?: string;
    /** Custom colour override for this placement (overrides device type colour) */
    colourOverride?: string;
    /** Slot position for half-width devices */
    slotPosition?: SlotPosition;
    onselect?: (event: CustomEvent<{ slug: string; position: number }>) => void;
    ondragstart?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    ondragend?: () => void;
    onduplicate?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    /** Context menu event with coordinates and device info */
    oncontextmenuopen?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        x: number;
        y: number;
      }>,
    ) => void;
    onPortClick?: (iface: InterfaceTemplate) => void;
  }

  let {
    device,
    position,
    rackHeight,
    rackId,
    deviceIndex,
    selected,
    uHeight,
    rackWidth,
    displayMode = "label",
    rackView = "front",
    showLabelsOnImages = false,
    placedDeviceName,
    placedDeviceId,
    colourOverride,
    slotPosition = "full",
    onselect,
    ondragstart: ondragstartProp,
    ondragend: ondragendProp,
    onduplicate,
    oncontextmenuopen,
    onPortClick,
  }: Props = $props();

  // Device display name: model or slug
  const deviceName = $derived(device.model ?? device.slug);

  // Display name: custom name if set, otherwise device type name
  const displayName = $derived(placedDeviceName ?? deviceName);

  // Effective colour: placement override or device type colour
  const effectiveColour = $derived(colourOverride ?? device.colour);

  const imageStore = getImageStore();

  // Check if display mode shows images (either 'image' or 'image-label')
  const isImageMode = $derived(
    displayMode === "image" || displayMode === "image-label",
  );

  // Get the device image URL for the current view
  // Fallback chain: placement image → device type image → null
  const deviceImageUrl = $derived.by(() => {
    if (!isImageMode) return null;
    const face = rackView === "rear" ? "rear" : "front";

    // Try placement-specific image first (if placedDeviceId is provided)
    if (placedDeviceId) {
      const placementUrl = imageStore.getImageUrl(
        `placement-${placedDeviceId}`,
        face,
      );
      if (placementUrl) return placementUrl;
    }

    // Fall back to device type image
    return imageStore.getImageUrl(device.slug, face);
  });

  // Should show image or fall back to label
  const showImage = $derived(isImageMode && deviceImageUrl);

  // Track dragging state for visual feedback
  let isDragging = $state(false);

  // Viewport detection for mobile-specific interactions
  const viewportStore = getViewportStore();

  // SVG group element ref for long-press gesture
  let groupElement: SVGGElement | null = $state(null);

  // Rect element ref for pointer capture (Safari 18.x fix #411)
  let rectElement: SVGRectElement | null = $state(null);

  // Pointer tracking for click vs drag detection
  const DRAG_THRESHOLD = 3; // pixels - movement beyond this initiates drag
  type PointerState = "idle" | "pressing" | "dragging";
  let pointerState: PointerState = $state("idle");
  let pointerStartPos: { x: number; y: number } | null = $state(null);
  let activePointerId: number | null = $state(null);

  // Image overflow: how far device images extend past rack rails (Issue #9)
  // Real equipment extends past the rails; this creates realistic front-mounting appearance
  const IMAGE_OVERFLOW = 4;

  // Position calculation (SVG y-coordinate, origin at top)
  // y = (rackHeight - position - device.u_height + 1) * uHeight
  const yPosition = $derived(
    (rackHeight - position - device.u_height + 1) * uHeight,
  );
  const deviceHeight = $derived(device.u_height * uHeight);
  // Full interior width (between rails)
  const fullWidth = $derived(rackWidth - RAIL_WIDTH * 2);
  // Device width depends on slot position: half-width for left/right, full for full
  const deviceWidth = $derived(
    slotPosition === "full" ? fullWidth : fullWidth / 2,
  );
  // X offset within the interior: 0 for left/full, half for right
  const slotXOffset = $derived(slotPosition === "right" ? fullWidth / 2 : 0);

  // Calculate available width for centered text (accounting for icon areas)
  // Uses shared constants from text-sizing.ts for consistency with exports
  const textAvailableWidth = $derived(
    deviceWidth - DEVICE_LABEL_ICON_SPACE_LEFT - DEVICE_LABEL_ICON_SPACE_RIGHT,
  );

  // Fit display name to available width with auto-sizing
  const fittedLabel = $derived(
    fitTextToWidth(displayName, {
      maxFontSize: DEVICE_LABEL_MAX_FONT,
      minFontSize: DEVICE_LABEL_MIN_FONT,
      availableWidth: textAvailableWidth,
    }),
  );

  // Image overlay uses slightly smaller max font and full width (no icons in image mode)
  const fittedImageLabel = $derived(
    fitTextToWidth(displayName, {
      maxFontSize: DEVICE_LABEL_IMAGE_MAX_FONT,
      minFontSize: DEVICE_LABEL_MIN_FONT,
      availableWidth: deviceWidth - 16, // Small padding on edges
    }),
  );

  // Image dimensions extend past device rect for realistic appearance
  const imageX = $derived(showImage ? -IMAGE_OVERFLOW : 0);
  const imageWidth = $derived(
    showImage ? deviceWidth + IMAGE_OVERFLOW * 2 : deviceWidth,
  );

  // Unique clipPath ID for this device instance
  const clipId = $derived(`clip-${device.slug}-${position}`);

  // Aria label for accessibility
  const ariaLabel = $derived(
    `${deviceName}, ${device.u_height}U ${device.category} at U${position}${selected ? ", selected" : ""}`,
  );

  // Handle keyboard activation (Enter/Space to select)
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onselect?.(
        new CustomEvent("select", { detail: { slug: device.slug, position } }),
      );
    }
  }

  // Pointer Events for unified mouse/touch handling (fixes Safari foreignObject bug #397)
  function handlePointerDown(event: PointerEvent) {
    // Only handle primary pointer (left mouse button or first touch)
    if (!event.isPrimary) return;

    // Don't interfere with port clicks
    const target = event.target as Element;
    if (target.closest(".port-indicators")) return;

    event.stopPropagation();
    event.preventDefault(); // Prevent Safari text selection during drag

    // Record starting position for click vs drag detection
    pointerStartPos = { x: event.clientX, y: event.clientY };
    pointerState = "pressing";
    activePointerId = event.pointerId;

    // Capture pointer to receive events even if cursor leaves element
    // Note: setPointerCapture may not exist in test environments (happy-dom)
    // Safari 18.x fix #411: Capture on the rect element (has explicit geometry)
    if (rectElement?.setPointerCapture) {
      rectElement.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    // Only track the pointer we started with
    if (event.pointerId !== activePointerId) return;
    if (!pointerStartPos) return;

    if (pointerState === "pressing") {
      // Check if we've moved beyond the drag threshold
      const distance = Math.hypot(
        event.clientX - pointerStartPos.x,
        event.clientY - pointerStartPos.y,
      );

      if (distance >= DRAG_THRESHOLD) {
        // Transition to dragging state
        pointerState = "dragging";
        isDragging = true;

        // Set up drag data for drop handling
        const dragData = createRackDeviceDragData(device, rackId, deviceIndex);
        setCurrentDragData(dragData);

        // Show drag tooltip at cursor position
        showDragTooltip(device, event.clientX, event.clientY);

        ondragstartProp?.(
          new CustomEvent("dragstart", { detail: { rackId, deviceIndex } }),
        );
      }
    }

    if (pointerState === "dragging") {
      // Update drag tooltip position
      updateDragTooltipPosition(event.clientX, event.clientY);

      // Dispatch pointermove to document for Rack to track drop position
      // The Rack listens for this via document-level handler
      document.dispatchEvent(
        new CustomEvent("rackula:dragmove", {
          detail: {
            clientX: event.clientX,
            clientY: event.clientY,
            device,
            rackId,
            deviceIndex,
          },
        }),
      );
    }
  }

  function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;

    // Release pointer capture (may not exist in test environments)
    // Exception is safe to ignore: releasePointerCapture throws if the pointer
    // was already released (e.g., by pointercancel or browser gesture handling).
    // This is a normal race condition, not an error condition.
    // Safari 18.x fix #411: Release on the rect element (has explicit geometry)
    if (rectElement?.releasePointerCapture && activePointerId !== null) {
      try {
        rectElement.releasePointerCapture(activePointerId);
      } catch {
        // Already released - safe to ignore
      }
    }

    if (pointerState === "pressing") {
      // No significant movement - this is a click
      event.stopPropagation();
      onselect?.(
        new CustomEvent("select", { detail: { slug: device.slug, position } }),
      );
    } else if (pointerState === "dragging") {
      // Complete the drag operation
      document.dispatchEvent(
        new CustomEvent("rackula:dragend", {
          detail: {
            clientX: event.clientX,
            clientY: event.clientY,
            device,
            rackId,
            deviceIndex,
          },
        }),
      );

      setCurrentDragData(null);
      isDragging = false;
      hideDragTooltip();
      ondragendProp?.();
    }

    // Reset state
    pointerState = "idle";
    pointerStartPos = null;
    activePointerId = null;
  }

  function handlePointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;

    // Cancel any in-progress drag
    if (pointerState === "dragging") {
      setCurrentDragData(null);
      isDragging = false;
      hideDragTooltip();
      ondragendProp?.();
    }

    // Reset state
    pointerState = "idle";
    pointerStartPos = null;
    activePointerId = null;
  }

  // Long-press handler for mobile (triggers selection + details)
  function handleLongPress() {
    onselect?.(
      new CustomEvent("select", { detail: { slug: device.slug, position } }),
    );
  }

  // Context menu handler (right-click) - opens device context menu
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    // If context menu handler is provided, use it; otherwise fall back to duplicate
    if (oncontextmenuopen) {
      oncontextmenuopen(
        new CustomEvent("contextmenuopen", {
          detail: {
            rackId,
            deviceIndex,
            x: event.clientX,
            y: event.clientY,
          },
        }),
      );
    } else {
      // Fallback to legacy duplicate behavior
      onduplicate?.(
        new CustomEvent("duplicate", { detail: { rackId, deviceIndex } }),
      );
    }
  }

  // Set up long-press gesture on mobile (reactive to viewport changes)
  $effect(() => {
    if (viewportStore.isMobile && groupElement) {
      const cleanup = useLongPress(groupElement, handleLongPress);
      return cleanup;
    }
  });
</script>

<g
  bind:this={groupElement}
  data-device-id={device.slug}
  data-device-position={position}
  transform="translate({RAIL_WIDTH + slotXOffset}, {yPosition})"
  class="rack-device"
  class:selected
  class:dragging={isDragging}
  role="button"
  tabindex="0"
  aria-label={ariaLabel}
  aria-pressed={selected}
  onclick={(e) => e.stopPropagation()}
  oncontextmenu={handleContextMenu}
  onkeydown={handleKeyDown}
>
  <!-- Device rectangle with pointer events (Safari 18.x fix #411)
       Using explicit geometry rect for pointer events instead of <g> element
       because Safari 18.x doesn't properly compute hit areas on transformed <g> elements -->
  <rect
    bind:this={rectElement}
    class="device-rect"
    x="0"
    y="0"
    width={deviceWidth}
    height={deviceHeight}
    fill={effectiveColour}
    rx="2"
    ry="2"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
  />

  <!-- Selection outline -->
  {#if selected}
    <rect
      class="device-selection"
      x="1"
      y="1"
      width={deviceWidth - 2}
      height={deviceHeight - 2}
      rx="2"
      ry="2"
    />
  {/if}

  <!-- Device content: Image or Label -->
  {#if showImage}
    <!-- ClipPath for rounded corners on device image -->
    <defs>
      <clipPath id={clipId}>
        <rect
          x={imageX}
          y="0"
          width={imageWidth}
          height={deviceHeight}
          rx="2"
          ry="2"
        />
      </clipPath>
    </defs>
    <!-- Device image: extends past rack rails for realistic front-mounting appearance -->
    <image
      class="device-image"
      x={imageX}
      y="0"
      width={imageWidth}
      height={deviceHeight}
      href={deviceImageUrl}
      preserveAspectRatio="xMidYMid slice"
      clip-path="url(#{clipId})"
    />
    <!-- Label overlay when showLabelsOnImages is true
         Safari 18.x fix #420: Use SVG-native component instead of foreignObject
         to avoid transform inheritance bug -->
    {#if showLabelsOnImages}
      <LabelOverlaySVG
        text={fittedImageLabel.text}
        fontSize={fittedImageLabel.fontSize}
        width={deviceWidth}
        height={deviceHeight}
      />
    {/if}
  {:else}
    <!-- Device name (centered, auto-sized) -->
    <text
      class="device-name"
      x={deviceWidth / 2}
      y={deviceHeight / 2}
      dominant-baseline="middle"
      text-anchor="middle"
      style="font-size: {fittedLabel.fontSize}px"
    >
      {fittedLabel.text}
    </text>

    <!-- Category icon (vertically centered)
         Safari 18.x fix #411: Use SVG-native component instead of foreignObject
         to avoid transform inheritance bug -->
    {#if deviceHeight >= 22}
      <CategoryIconSVG
        category={device.category}
        size={14}
        x={8}
        y={(deviceHeight - 14) / 2}
      />
    {/if}
  {/if}

  <!-- Port indicators (rendered after device content) -->
  {#if device.interfaces?.length}
    <PortIndicators
      interfaces={device.interfaces}
      {deviceWidth}
      {deviceHeight}
      {rackView}
      {onPortClick}
    />
  {/if}
</g>

<style>
  .rack-device {
    /* Enable GPU-accelerated filter animations */
    will-change: filter;
    transition: filter var(--anim-drag-settle, 0.15s) ease-out;
  }

  .rack-device.dragging {
    opacity: 0.7;
    /* Drop shadow provides visual feedback during drag.
		   Note: CSS transform: scale() is NOT used here because SVG <g> elements
		   with existing transform="translate()" attributes will have their
		   CSS transform-origin calculated incorrectly, causing a visual position
		   jump when dragging starts. See Issue #5. */
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
  }

  /* Hover state: subtle lift before dragging */
  .rack-device:hover:not(.dragging) {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }

  /* Touch behavior for interactive SVG group
     Safari 18.x fix #411: cursor moved to .device-rect for proper hit area */
  .rack-device {
    /* iOS Safari fixes (#232):
       - Disable Safari's default callout/context menu on long press
       - Prevent text selection during touch gestures
       - Allow pan/pinch zoom but disable double-tap zoom delay */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }

  /* Focus styling for keyboard navigation */
  .rack-device:focus {
    outline: none;
  }

  .rack-device:focus .device-rect,
  .rack-device:focus-within .device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  /* Focus-visible for keyboard-only focus indication */
  .rack-device:focus-visible .device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  .device-rect {
    stroke: rgba(0, 0, 0, 0.2);
    stroke-width: 1;
    /* Safari 18.x fix #411: cursor on rect element for proper hit area */
    cursor: grab;
  }

  .rack-device:active .device-rect,
  .rack-device.dragging .device-rect {
    cursor: grabbing;
  }

  .device-selection {
    fill: none;
    stroke: var(--colour-selection);
    stroke-width: 2;
    pointer-events: none;
  }

  .device-name {
    fill: var(--neutral-50);
    font-size: var(--font-size-device, 13px);
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    user-select: none;
  }

  /* Safari 18.x fix #411: category-icon-wrapper and icon-container CSS removed
     Category icons now use SVG-native CategoryIconSVG component */

  /* Safari 18.x fix #420: label-overlay-wrapper and label-overlay CSS removed
     Label overlays now use SVG-native LabelOverlaySVG component */

  .device-image {
    pointer-events: none;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .rack-device {
      transition: none;
    }

    .rack-device.dragging {
      transform: none;
    }
  }
</style>
