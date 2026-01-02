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
  } from "$lib/types";
  import PortIndicators from "./PortIndicators.svelte";
  import {
    createRackDeviceDragData,
    serializeDragData,
    setCurrentDragData,
  } from "$lib/utils/dragdrop";
  import CategoryIcon from "./CategoryIcon.svelte";
  import { IconGrip } from "./icons";
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
    onselect?: (event: CustomEvent<{ slug: string; position: number }>) => void;
    ondragstart?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    ondragend?: () => void;
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
    onselect,
    ondragstart: ondragstartProp,
    ondragend: ondragendProp,
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

  // Drag handle element ref for long-press
  let dragHandleElement: HTMLDivElement | null = $state(null);

  // Image overflow: how far device images extend past rack rails (Issue #9)
  // Real equipment extends past the rails; this creates realistic front-mounting appearance
  const IMAGE_OVERFLOW = 4;

  // Position calculation (SVG y-coordinate, origin at top)
  // y = (rackHeight - position - device.u_height + 1) * uHeight
  const yPosition = $derived(
    (rackHeight - position - device.u_height + 1) * uHeight,
  );
  const deviceHeight = $derived(device.u_height * uHeight);
  const deviceWidth = $derived(rackWidth - RAIL_WIDTH * 2);

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

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onselect?.(
      new CustomEvent("select", { detail: { slug: device.slug, position } }),
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onselect?.(
        new CustomEvent("select", { detail: { slug: device.slug, position } }),
      );
    }
  }

  function handleDragStart(event: DragEvent) {
    if (!event.dataTransfer) return;

    const dragData = createRackDeviceDragData(device, rackId, deviceIndex);
    event.dataTransfer.setData("application/json", serializeDragData(dragData));
    event.dataTransfer.effectAllowed = "move";

    // Set shared drag state for dragover (browsers block getData during dragover)
    setCurrentDragData(dragData);
    isDragging = true;
    ondragstartProp?.(
      new CustomEvent("dragstart", { detail: { rackId, deviceIndex } }),
    );
  }

  function handleDragEnd() {
    setCurrentDragData(null);
    isDragging = false;
    ondragendProp?.();
  }

  // Long-press handler for mobile (triggers selection + details)
  function handleLongPress() {
    console.log("[RackDevice] Long-press triggered:", {
      slug: device.slug,
      position,
    });
    onselect?.(
      new CustomEvent("select", { detail: { slug: device.slug, position } }),
    );
  }

  // Set up long-press gesture on mobile (reactive to viewport changes)
  $effect(() => {
    if (viewportStore.isMobile && dragHandleElement) {
      console.log(
        "[RackDevice] Setting up long-press for device:",
        device.slug,
        "isMobile:",
        viewportStore.isMobile,
      );
      const cleanup = useLongPress(dragHandleElement, handleLongPress);
      return cleanup;
    }
  });
</script>

<g
  data-device-id={device.slug}
  transform="translate({RAIL_WIDTH}, {yPosition})"
  class="rack-device"
  class:selected
  class:dragging={isDragging}
>
  <!-- Device rectangle -->
  <rect
    class="device-rect"
    x="0"
    y="0"
    width={deviceWidth}
    height={deviceHeight}
    fill={effectiveColour}
    rx="2"
    ry="2"
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
    <!-- Label overlay when showLabelsOnImages is true -->
    {#if showLabelsOnImages}
      <foreignObject
        x="0"
        y="0"
        width={deviceWidth}
        height={deviceHeight}
        class="label-overlay-wrapper"
      >
        <!-- xmlns required for foreignObject HTML content on mobile browsers -->
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          class="label-overlay"
          style="font-size: {fittedImageLabel.fontSize}px"
        >
          {fittedImageLabel.text}
        </div>
      </foreignObject>
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

    <!-- Category icon (vertically centered) -->
    {#if deviceHeight >= 22}
      <foreignObject
        x="8"
        y="0"
        width="16"
        height={deviceHeight}
        class="category-icon-wrapper"
      >
        <!-- xmlns required for foreignObject HTML content on mobile browsers -->
        <div xmlns="http://www.w3.org/1999/xhtml" class="icon-container">
          <CategoryIcon category={device.category} size={14} />
        </div>
      </foreignObject>
    {/if}
  {/if}

  <!-- Port indicators (layer 3.5: after device content, before drag overlay) -->
  {#if device.interfaces?.length}
    <PortIndicators
      interfaces={device.interfaces}
      {deviceWidth}
      {deviceHeight}
      {rackView}
      {onPortClick}
    />
  {/if}

  <!-- Invisible HTML overlay for drag-and-drop (rendered last to be on top for click events) -->
  <foreignObject
    x="0"
    y="0"
    width={deviceWidth}
    height={deviceHeight}
    class="drag-overlay"
  >
    <!-- xmlns required for foreignObject HTML content on mobile browsers -->
    <div
      xmlns="http://www.w3.org/1999/xhtml"
      bind:this={dragHandleElement}
      class="drag-handle"
      role="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      tabindex="0"
      draggable="true"
      onclick={handleClick}
      onkeydown={handleKeyDown}
      ondragstart={handleDragStart}
      ondragend={handleDragEnd}
    >
      <!-- Grip icon for drag affordance -->
      <div class="grip-icon-container">
        <IconGrip size={12} />
      </div>
    </div>
  </foreignObject>
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

  .drag-overlay {
    overflow: visible;
  }

  .drag-handle {
    position: relative;
    width: 100%;
    height: 100%;
    cursor: grab;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    /* iOS Safari long-press fixes (#232):
       - Disable Safari's default callout/context menu on long press
       - Prevent text selection during touch gestures
       - Allow pan/pinch zoom but disable double-tap zoom delay */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-handle:focus {
    outline: none;
  }

  .rack-device:focus-within .device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  .device-rect {
    stroke: rgba(0, 0, 0, 0.2);
    stroke-width: 1;
    pointer-events: none;
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

  .category-icon-wrapper {
    pointer-events: none;
    overflow: visible;
  }

  .icon-container {
    display: flex;
    align-items: center;
    height: 100%;
    color: rgba(255, 255, 255, 0.8);
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
  }

  .grip-icon-container {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    transition:
      opacity var(--duration-fast, 100ms) var(--ease-out, ease-out),
      transform var(--duration-fast, 100ms) var(--ease-out, ease-out);
    color: rgba(255, 255, 255, 0.6);
    pointer-events: none;
  }

  .drag-handle:hover .grip-icon-container,
  .drag-handle:focus .grip-icon-container {
    opacity: 1;
  }

  .drag-handle:active .grip-icon-container {
    opacity: 1;
    transform: translateY(-50%) scale(0.9);
  }

  .label-overlay-wrapper {
    overflow: visible;
    pointer-events: none;
  }

  .label-overlay {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 100%;
    padding-bottom: 2px;
    font-size: var(--font-size-device, 12px);
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    color: var(--neutral-50);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.8),
      0 0 4px rgba(0, 0, 0, 0.5);
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.6) 0%,
      rgba(0, 0, 0, 0.3) 50%,
      transparent 100%
    );
    user-select: none;
  }

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
