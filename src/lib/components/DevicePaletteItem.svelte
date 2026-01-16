<!--
  DevicePaletteItem Component
  Displays a single device in the device palette
  Draggable for placement into racks
-->
<script lang="ts">
  import type { DeviceType } from "$lib/types";
  import IconGrip from "./icons/IconGrip.svelte";
  import CategoryIcon from "./CategoryIcon.svelte";
  import ImageIndicator from "./ImageIndicator.svelte";
  import {
    createPaletteDragData,
    serializeDragData,
    setCurrentDragData,
    hideNativeDragGhost,
  } from "$lib/utils/dragdrop";
  import {
    showDragTooltip,
    updateDragTooltipPosition,
    hideDragTooltip,
  } from "$lib/stores/dragTooltip.svelte";
  import { highlightMatch } from "$lib/utils/searchHighlight";

  interface Props {
    device: DeviceType;
    librarySelected?: boolean;
    searchQuery?: string;
    /** Whether device is compatible with current rack width. Defaults to true. */
    isCompatible?: boolean;
    /** Tooltip text to show when device is incompatible */
    incompatibilityReason?: string;
    onselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
  }

  let {
    device,
    librarySelected = false,
    searchQuery = "",
    isCompatible = true,
    incompatibilityReason = "",
    onselect,
  }: Props = $props();

  // Device display name: model or slug
  const deviceName = $derived(device.model ?? device.slug);

  // Highlighted text segments for search matching
  const highlightedSegments = $derived(highlightMatch(deviceName, searchQuery));

  // Track dragging state for visual feedback
  let isDragging = $state(false);

  function handleClick() {
    onselect?.(new CustomEvent("select", { detail: { device } }));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onselect?.(new CustomEvent("select", { detail: { device } }));
    }
  }

  function handleDragStart(event: DragEvent) {
    // Prevent dragging incompatible devices
    if (!isCompatible) {
      event.preventDefault();
      return;
    }

    if (!event.dataTransfer) return;

    const dragData = createPaletteDragData(device);
    event.dataTransfer.setData("application/json", serializeDragData(dragData));
    event.dataTransfer.effectAllowed = "copy";

    // Hide native drag ghost - only our DragTooltip will show
    hideNativeDragGhost(event.dataTransfer);

    // Set shared drag state for dragover (browsers block getData during dragover)
    setCurrentDragData(dragData);
    isDragging = true;

    // Show drag tooltip at initial cursor position
    showDragTooltip(device, event.clientX, event.clientY);
  }

  function handleDrag(event: DragEvent) {
    // Update tooltip position during drag
    // Note: Some browsers report 0,0 for clientX/clientY at drag end
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateDragTooltipPosition(event.clientX, event.clientY);
    }
  }

  function handleDragEnd() {
    setCurrentDragData(null);
    isDragging = false;
    hideDragTooltip();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="device-palette-item"
  class:dragging={isDragging}
  class:library-selected={librarySelected}
  class:incompatible={!isCompatible}
  role="listitem"
  tabindex="0"
  draggable={isCompatible}
  data-testid="device-palette-item"
  title={!isCompatible ? incompatibilityReason : undefined}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  ondragstart={handleDragStart}
  ondrag={handleDrag}
  ondragend={handleDragEnd}
  aria-label="{deviceName}, {device.u_height}U {device.category}{!isCompatible
    ? ` (${incompatibilityReason})`
    : ''}"
>
  <span class="drag-handle" aria-hidden="true">
    <IconGrip size={16} />
  </span>
  <span class="category-icon-indicator" style="color: {device.colour}">
    <CategoryIcon category={device.category} size={16} />
  </span>
  <span class="device-name">
    {#each highlightedSegments as segment, i (i)}
      {#if segment.isMatch}
        <strong>{segment.text}</strong>
      {:else}
        {segment.text}
      {/if}
    {/each}
  </span>
  {#if device.front_image || device.rear_image}
    <ImageIndicator
      front={device.front_image}
      rear={device.rear_image}
      size={14}
    />
  {/if}
  <span class="device-height">{device.u_height}U</span>
  {#if device.is_full_depth === false}
    <span
      class="depth-indicator"
      title="Half-depth: Mounts on one face only"
      aria-label="Half-depth device">½D</span
    >
  {/if}
</div>

<style>
  .device-palette-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    min-height: var(--touch-target-min);
    border-radius: var(--radius-sm);
    cursor: grab;
    transition:
      transform var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }

  .device-palette-item:hover {
    background-color: var(--colour-surface-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .device-palette-item:active,
  .device-palette-item.dragging {
    cursor: grabbing;
    transform: translateY(-2px) scale(1.02);
    box-shadow: var(--shadow-lg);
    z-index: 100;
  }

  .device-palette-item:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: var(--space-1);
  }

  .device-palette-item.library-selected {
    background-color: color-mix(
      in srgb,
      var(--colour-selection) 15%,
      transparent
    );
    border: 1px solid var(--colour-selection);
  }

  /* Incompatible device styling */
  .device-palette-item.incompatible {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .device-palette-item.incompatible:hover {
    /* Override normal hover effects - keep muted appearance */
    transform: none;
    box-shadow: none;
    background-color: transparent;
  }

  .device-palette-item.incompatible .device-name {
    text-decoration: line-through;
    text-decoration-color: var(--colour-text-muted);
  }

  .device-palette-item.incompatible .drag-handle {
    opacity: 0.3;
  }

  .drag-handle {
    color: var(--colour-text-muted);
    opacity: 0.5;
    transition: opacity var(--duration-fast) var(--ease-out);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .device-palette-item:hover .drag-handle {
    opacity: 1;
  }

  .category-icon-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .device-name {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .device-height {
    background-color: var(--colour-surface-active);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
    flex-shrink: 0;
  }

  .depth-indicator {
    background-color: var(--colour-surface-hover);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text-muted);
    flex-shrink: 0;
    cursor: help;
  }
</style>
