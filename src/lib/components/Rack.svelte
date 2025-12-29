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
  import { screenToSVG } from "$lib/utils/coordinates";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getBlockedSlots } from "$lib/utils/blocked-slots";
  import { isChristmas } from "$lib/utils/christmas";

  const canvasStore = getCanvasStore();

  // Christmas easter egg
  const showChristmasHats = isChristmas();

  // Synthetic rack ID for single-rack mode
  const RACK_ID = "rack-0";

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
  // Full-depth devices are visible from both sides, so they appear on both faces
  const visibleDevices = $derived(
    rack.devices
      .map((placedDevice, originalIndex) => ({ placedDevice, originalIndex }))
      .filter(({ placedDevice }) => {
        const { face } = placedDevice;
        // Both-face devices visible in all views
        if (face === "both") return true;
        // Devices on this face are always visible
        if (face === effectiveFaceFilter) return true;
        // Full-depth devices on the opposite face are also visible (they span full rack depth)
        if (faceFilter) {
          const deviceType = getDeviceBySlug(placedDevice.device_type);
          if (deviceType) {
            const isFullDepth = deviceType.is_full_depth !== false;
            if (isFullDepth) return true;
          }
        }
        return false;
      }),
  );

  // Calculate blocked slots for this view (only when faceFilter is set)
  const blockedSlots = $derived(
    faceFilter ? getBlockedSlots(rack, faceFilter, deviceLibrary) : [],
  );

  function handleClick(_event: MouseEvent) {
    // Don't select rack if we just finished panning
    if (canvasStore.isPanning) return;
    // Don't select rack if we just finished dragging a device
    if (justFinishedDrag) {
      justFinishedDrag = false;
      return;
    }

    onselect?.(new CustomEvent("select", { detail: { rackId: RACK_ID } }));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onselect?.(new CustomEvent("select", { detail: { rackId: RACK_ID } }));
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
      dragData.sourceRackId === RACK_ID &&
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
      dragData.device.is_full_depth ?? true,
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
    }, 100);
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
      dragData.sourceRackId === RACK_ID &&
      dragData.sourceIndex !== undefined;

    // Determine if this is a cross-rack move (from different rack)
    const isCrossRackMove =
      dragData.type === "rack-device" &&
      dragData.sourceRackId !== RACK_ID &&
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
      dragData.device.is_full_depth ?? true,
    );

    if (feedback === "valid") {
      if (isInternalMove && dragData.sourceIndex !== undefined) {
        // Internal move within same rack
        ondevicemove?.(
          new CustomEvent("devicemove", {
            detail: {
              rackId: RACK_ID,
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
              targetRackId: RACK_ID,
              targetPosition: targetU,
            },
          }),
        );
      } else {
        // External drop from palette (library-device type)
        ondevicedrop?.(
          new CustomEvent("devicedrop", {
            detail: {
              rackId: RACK_ID,
              slug: dragData.device.slug,
              position: targetU,
            },
          }),
        );
      }
    }
  }

  // NOTE: Rack drag handle for reordering removed in v0.1.1 (single-rack mode)
  // Restore in v0.3 when multi-rack support returns

  // Shift key handlers for fine-positioning mode
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
  tabindex="0"
  aria-selected={selected}
  role="option"
  onkeydown={handleKeyDown}
  onclick={handleClick}
>
  <!-- NOTE: Drag handle removed in v0.1.1 (single-rack mode) -->
  <svg
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
      <rect
        class="u-slot"
        class:u-slot-even={uPosition % 2 === 0}
        class:drop-target={isDropTarget}
        class:drop-valid={isDropTarget && dropPreview?.feedback === "valid"}
        class:drop-invalid={isDropTarget &&
          (dropPreview?.feedback === "invalid" ||
            dropPreview?.feedback === "blocked")}
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
      <!-- Diagonal stripe pattern for blocked slots -->
      <pattern
        id="blocked-stripe-pattern"
        patternUnits="userSpaceOnUse"
        width="8"
        height="8"
        patternTransform="rotate(45)"
      >
        <rect width="4" height="8" class="blocked-stripe-rect" />
      </pattern>
    </defs>

    <!-- Blocked Slots Overlay (renders before devices so devices appear on top) -->
    {#if blockedSlots.length > 0}
      <g
        class="blocked-slots-layer"
        transform="translate(0, {RACK_PADDING + RAIL_WIDTH})"
      >
        {#each blockedSlots as slot (slot.bottom + "-" + slot.top)}
          <!-- Background wash -->
          <rect
            class="blocked-slot blocked-slot-bg"
            x={RAIL_WIDTH}
            y={(rack.height - slot.top) * U_HEIGHT}
            width={RACK_WIDTH - 2 * RAIL_WIDTH}
            height={(slot.top - slot.bottom + 1) * U_HEIGHT}
            opacity="0.5"
          />
          <!-- Diagonal stripe pattern -->
          <rect
            class="blocked-slot blocked-slot-stripes"
            x={RAIL_WIDTH}
            y={(rack.height - slot.top) * U_HEIGHT}
            width={RACK_WIDTH - 2 * RAIL_WIDTH}
            height={(slot.top - slot.bottom + 1) * U_HEIGHT}
            fill="url(#blocked-stripe-pattern)"
            opacity="0.8"
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
            rackId={RACK_ID}
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
            onselect={ondeviceselect}
            ondragstart={() => handleDeviceDragStart(originalIndex)}
            ondragend={handleDeviceDragEnd}
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

  /* Blocked Slots - Diagonal stripe pattern */
  .blocked-stripe-rect {
    fill: var(--colour-blocked-stripe, rgba(239, 68, 68, 0.35));
  }

  .blocked-slot-bg {
    fill: var(--colour-blocked-bg, rgba(239, 68, 68, 0.08));
  }

  .blocked-slot-stripes {
    pointer-events: none;
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
</style>
