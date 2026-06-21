<!--
  DevicePaletteItem Component
  Displays a single device in the device palette
  Draggable for placement into racks
-->
<script lang="ts">
  import type { DeviceType } from "$lib/types";
  import IconGrip from "./icons/IconGrip.svelte";
  import IconTrash from "./icons/IconTrash.svelte";
  import IconPin from "./icons/IconPin.svelte";
  import CategoryIcon from "./CategoryIcon.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import ImageIndicator from "./ImageIndicator.svelte";
  import Tooltip from "./Tooltip.svelte";
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
  import PaletteDeviceContextMenu from "./PaletteDeviceContextMenu.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  interface Props {
    device: DeviceType;
    librarySelected?: boolean;
    searchQuery?: string;
    /** Whether device is compatible with current rack width. Defaults to true. */
    isCompatible?: boolean;
    /** Tooltip text to show when device is incompatible */
    incompatibilityReason?: string | null;
    /** Whether this device type can be deleted (unused custom type) */
    canDelete?: boolean;
    /** Whether this device is pinned (favourited) to the top of the palette */
    isFavourite?: boolean;
    onselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
    /** Called when user clicks delete button for unused custom device */
    ondelete?: (event: CustomEvent<{ device: DeviceType }>) => void;
    /** Called when user pins or unpins the device */
    ontogglefavourite?: (event: CustomEvent<{ device: DeviceType }>) => void;
  }

  let {
    device,
    librarySelected = false,
    searchQuery = "",
    isCompatible = true,
    incompatibilityReason = null,
    canDelete = false,
    isFavourite = false,
    onselect,
    ondelete,
    ontogglefavourite,
  }: Props = $props();

  // Device display name: model or slug
  const deviceName = $derived(device.model ?? device.slug);

  // Check if device is half-width
  const isHalfWidth = $derived(device.slot_width === 1);

  // Build accessible description for device
  const ariaDescription = $derived.by(() => {
    const parts = [deviceName, `${device.u_height}U`, device.category];
    if (isHalfWidth) parts.push("half-width");
    if (device.is_full_depth === false) parts.push("half-depth");
    if (isFavourite) parts.push("pinned");
    if (!isCompatible && incompatibilityReason)
      parts.push(`(${incompatibilityReason})`);
    return parts.join(", ");
  });

  const favouriteLabel = $derived(
    isFavourite ? `Unpin ${deviceName}` : `Pin ${deviceName}`,
  );

  // Highlighted text segments for search matching
  const highlightedSegments = $derived(highlightMatch(deviceName, searchQuery));

  // Track dragging state for visual feedback
  let isDragging = $state(false);

  // Context menu state (right-click for custom devices)
  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let showConfirmDelete = $state(false);

  function handleClick() {
    onselect?.(new CustomEvent("select", { detail: { device } }));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onselect?.(new CustomEvent("select", { detail: { device } }));
    }
  }

  function handleDeleteClick(event: MouseEvent) {
    // Prevent triggering the parent click handler
    event.stopPropagation();
    ondelete?.(new CustomEvent("delete", { detail: { device } }));
  }

  function handleDeleteKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      ondelete?.(new CustomEvent("delete", { detail: { device } }));
    }
  }

  function emitToggleFavourite() {
    ontogglefavourite?.(
      new CustomEvent("togglefavourite", { detail: { device } }),
    );
  }

  function handleFavouriteClick(event: MouseEvent) {
    event.stopPropagation();
    emitToggleFavourite();
  }

  function handleFavouriteKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      emitToggleFavourite();
    }
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuOpen = true;
  }

  function handleContextMenuDelete() {
    contextMenuOpen = false;
    showConfirmDelete = true;
  }

  function handleContextMenuFavourite() {
    contextMenuOpen = false;
    emitToggleFavourite();
  }

  function handleConfirmDelete() {
    showConfirmDelete = false;
    ondelete?.(new CustomEvent("delete", { detail: { device } }));
  }

  // Tracks whether this instance owns the current drag session.
  // Prevents unmounting non-dragging instances from clearing shared drag state.
  let ownsDrag = false;

  // Document-level dragover listener for tooltip position tracking.
  // Firefox reports 0,0 for clientX/clientY on source-element `drag` events,
  // so we use `dragover` on the document which provides correct coordinates
  // in all browsers. Registered in capture phase so stopPropagation() in
  // descendant handlers cannot prevent it from firing.
  function handleDocumentDragOver(event: DragEvent) {
    if (event.clientX !== 0 || event.clientY !== 0) {
      updateDragTooltipPosition(event.clientX, event.clientY);
    }
  }

  // Shared teardown for all drag cleanup paths (dragend, drop fallback, unmount).
  // Only clears shared state if this instance owns the active drag.
  function teardownDrag() {
    document.removeEventListener("dragover", handleDocumentDragOver, true);
    document.removeEventListener("drop", handleDocumentDrop, true);
    if (ownsDrag) {
      ownsDrag = false;
      setCurrentDragData(null);
      isDragging = false;
      hideDragTooltip();
    }
  }

  // Fallback cleanup: Firefox sometimes fails to fire dragend during rapid
  // dragging. A capture-phase document drop listener ensures cleanup always runs.
  function handleDocumentDrop() {
    teardownDrag();
  }

  // Clean up document listeners if component unmounts mid-drag
  $effect(() => teardownDrag);

  function handleDragStart(event: DragEvent) {
    // Prevent dragging incompatible devices
    if (!isCompatible) {
      event.preventDefault();
      return;
    }

    if (!event.dataTransfer) return;

    const dragData = createPaletteDragData(device);
    const serialized = serializeDragData(dragData);
    event.dataTransfer.setData("application/json", serialized);
    // Safari requires text/plain fallback for reliable drag initiation
    event.dataTransfer.setData("text/plain", serialized);
    event.dataTransfer.effectAllowed = "copy";

    // Hide native drag ghost - only our DragTooltip will show
    hideNativeDragGhost(event.dataTransfer);

    // Set shared drag state for dragover (browsers block getData during dragover)
    setCurrentDragData(dragData);
    ownsDrag = true;
    isDragging = true;

    // Show drag tooltip at initial cursor position
    showDragTooltip(device, event.clientX, event.clientY);

    // Track tooltip position via document dragover (capture phase so
    // stopPropagation in descendant handlers cannot block it)
    document.addEventListener("dragover", handleDocumentDragOver, true);
    // Fallback: capture-phase drop listener ensures cleanup if dragend doesn't fire
    document.addEventListener("drop", handleDocumentDrop, true);
  }

  function handleDragEnd() {
    teardownDrag();
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
  title={!isCompatible ? (incompatibilityReason ?? undefined) : undefined}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  aria-label={ariaDescription}
>
  <span class="drag-handle" aria-hidden="true">
    <IconGrip size={ICON_SIZE.sm} />
  </span>
  <span class="category-icon-indicator" style="color: {device.colour}">
    <CategoryIcon category={device.category} size={ICON_SIZE.sm} />
  </span>
  <span class="device-name" title={isCompatible ? deviceName : undefined}>
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
  <span class="device-spec">
    <span class="device-height">{device.u_height}U</span>
    {#if isHalfWidth}
      <span
        class="form-marker"
        title="Half-width: Mounts inside a carrier, not directly on the rails"
        aria-label="Half-width device">½W</span
      >
    {/if}
    {#if device.is_full_depth === false}
      <span
        class="form-marker"
        title="Half-depth: Mounts on one face only"
        aria-label="Half-depth device">½D</span
      >
    {/if}
  </span>
  <Tooltip text={isFavourite ? "Unpin device" : "Pin device"} position="left">
    <button
      type="button"
      class="favourite-btn"
      class:active={isFavourite}
      onclick={handleFavouriteClick}
      onkeydown={handleFavouriteKeyDown}
      aria-label={favouriteLabel}
      aria-pressed={isFavourite}
      data-testid="favourite-device-btn"
    >
      <IconPin size={ICON_SIZE.sm} filled={isFavourite} />
    </button>
  </Tooltip>
  {#if canDelete}
    <Tooltip text="Delete unused device type" position="left">
      <button
        type="button"
        class="delete-btn"
        onclick={handleDeleteClick}
        onkeydown={handleDeleteKeyDown}
        aria-label="Delete {deviceName}"
        data-testid="delete-device-type-btn"
      >
        <IconTrash size={ICON_SIZE.sm} />
      </button>
    </Tooltip>
  {/if}
</div>

<!-- Mounted only once a right-click opens it, so the common case (hundreds of
     palette rows) does not each carry an idle ContextMenu.Root + Portal. -->
{#if contextMenuOpen}
  <PaletteDeviceContextMenu
    bind:open={contextMenuOpen}
    x={contextMenuX}
    y={contextMenuY}
    {isFavourite}
    {canDelete}
    ontogglefavourite={handleContextMenuFavourite}
    ondelete={handleContextMenuDelete}
  />
{/if}

{#if canDelete}
  <ConfirmDialog
    open={showConfirmDelete}
    title="Delete Device Type"
    message={`Delete "${deviceName}"? This will remove the device from your library.`}
    confirmLabel="Delete"
    onconfirm={handleConfirmDelete}
    oncancel={() => (showConfirmDelete = false)}
  />
{/if}

<style>
  .device-palette-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    min-height: var(--touch-target-min);
    border-radius: var(--radius-sm);
    cursor: grab;
    /* Safari drag support: prevent text selection during drag */
    -webkit-user-select: none;
    user-select: none;
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

  /* Spec cluster: U-height pill plus optional form-factor markers, grouped
     tightly so they read as one block of metadata rather than three pills
     each competing with the device name for width. */
  .device-spec {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .device-height {
    background-color: var(--colour-surface-active);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
  }

  /* Half-width and half-depth are quiet glyph markers, not background pills,
     so they annotate the spec without holding pill-sized horizontal budget. */
  .form-marker {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text-muted);
    cursor: help;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    height: var(--space-6);
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--colour-text-muted);
    opacity: 0;
    transition:
      opacity var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
    flex-shrink: 0;
  }

  .device-palette-item:hover .delete-btn,
  .device-palette-item:focus-within .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--colour-error);
    background-color: var(--colour-surface-active);
  }

  .delete-btn:focus-visible {
    opacity: 1;
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 1px;
  }

  .favourite-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    height: var(--space-6);
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--colour-text-muted);
    opacity: 0;
    transition:
      opacity var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
    flex-shrink: 0;
  }

  /* Pinned devices keep the pin visible at rest so the state reads at a glance. */
  .favourite-btn.active {
    opacity: 1;
    color: var(--colour-selection);
  }

  .device-palette-item:hover .favourite-btn,
  .device-palette-item:focus-within .favourite-btn {
    opacity: 1;
  }

  .favourite-btn:hover {
    color: var(--colour-selection);
    background-color: var(--colour-surface-active);
  }

  .favourite-btn:focus-visible {
    opacity: 1;
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 1px;
  }
</style>
