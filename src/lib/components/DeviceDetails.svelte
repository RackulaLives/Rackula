<!--
  DeviceDetails Component
  Displays detailed information about a device
  Used in bottom sheet (mobile) and potentially edit panel (desktop)
-->
<script lang="ts">
  import type { PlacedDevice, DeviceType, RackView } from "$lib/types";
  import CategoryIcon from "./CategoryIcon.svelte";
  import { IconChevronUp, IconChevronDown, IconTrash } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { toHumanUnits } from "$lib/utils/position";

  interface Props {
    device: PlacedDevice;
    deviceType: DeviceType;
    rackView?: RackView;
    rackHeight?: number;
    /** Show action buttons (remove, move) - used on mobile */
    showActions?: boolean;
    /** Callback when remove button is clicked */
    onremove?: () => void;
    /** Callback when move up button is clicked */
    onmoveup?: () => void;
    /** Callback when move down button is clicked */
    onmovedown?: () => void;
    /** Whether device can move up (not at top of rack) */
    canMoveUp?: boolean;
    /** Whether device can move down (not at bottom of rack) */
    canMoveDown?: boolean;
  }

  let {
    device,
    deviceType,
    rackView: _rackView = "front",
    rackHeight: _rackHeight,
    showActions = false,
    onremove,
    onmoveup,
    onmovedown,
    canMoveUp = true,
    canMoveDown = true,
  }: Props = $props();

  // Display name: custom name if set, otherwise device type model/slug
  const displayName = $derived(
    device.name ?? deviceType.model ?? deviceType.slug,
  );

  // Format position display (e.g., "U12-U13, Front")
  const positionDisplay = $derived.by(() => {
    // Convert from internal units to human U for display
    const positionU = toHumanUnits(device.position);
    const topU = positionU + deviceType.u_height - 1;
    const positionStr =
      deviceType.u_height === 1 ? `U${positionU}` : `U${positionU}-U${topU}`;
    const faceStr =
      device.face === "both"
        ? "Both Faces"
        : device.face === "front"
          ? "Front"
          : "Rear";
    return `${positionStr}, ${faceStr}`;
  });

  // Height display (e.g., "2U")
  const heightDisplay = $derived(`${deviceType.u_height}U`);
</script>

<div class="device-details">
  <!-- Device Name -->
  <div class="detail-section name-section">
    <h3 class="device-name">{displayName}</h3>
  </div>

  <!-- Primary Info (Height, Category, Position) -->
  <div class="detail-section info-section">
    <div class="info-row">
      <span class="info-label">Height</span>
      <span class="info-value">{heightDisplay}</span>
    </div>

    <div class="info-row">
      <span class="info-label">Category</span>
      <span class="info-value category-value">
        <CategoryIcon category={deviceType.category} size={ICON_SIZE.sm} />
        <span>{deviceType.category}</span>
      </span>
    </div>

    <div class="info-row">
      <span class="info-label">Position</span>
      <span class="info-value">{positionDisplay}</span>
    </div>
  </div>

  <!-- Optional Info (Manufacturer, Part Number) -->
  {#if deviceType.manufacturer || deviceType.part_number}
    <div class="detail-section optional-section">
      {#if deviceType.manufacturer}
        <div class="info-row">
          <span class="info-label">Manufacturer</span>
          <span class="info-value">{deviceType.manufacturer}</span>
        </div>
      {/if}

      {#if deviceType.part_number}
        <div class="info-row">
          <span class="info-label">Part Number</span>
          <span class="info-value">{deviceType.part_number}</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Notes -->
  {#if device.notes}
    <div class="detail-section notes-section">
      <span class="info-label">Notes</span>
      <p class="notes-text">{device.notes}</p>
    </div>
  {/if}

  <!-- Action buttons (mobile) -->
  {#if showActions}
    <div class="detail-section actions-section">
      <div class="move-buttons">
        <button
          type="button"
          class="btn btn-secondary"
          onclick={onmoveup}
          disabled={!canMoveUp}
          aria-label="Move device up"
        >
          <IconChevronUp />
          Move Up
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={onmovedown}
          disabled={!canMoveDown}
          aria-label="Move device down"
        >
          <IconChevronDown />
          Move Down
        </button>
      </div>
      <button
        type="button"
        class="btn btn-danger"
        onclick={onremove}
        aria-label="Remove device from rack"
      >
        <IconTrash size={ICON_SIZE.sm} />
        Remove from Rack
      </button>
    </div>
  {/if}
</div>

<style>
  .device-details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    font-size: 0.875rem;
  }

  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .name-section {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .device-name {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
  }

  .info-section,
  .optional-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .info-label {
    font-weight: 500;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .info-value {
    text-align: right;
    color: var(--color-text);
    flex-grow: 1;
  }

  .category-value {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .notes-section {
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .notes-text {
    margin: 0;
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Action buttons */
  .actions-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .move-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 500;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      opacity 0.15s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    flex: 1;
    background: var(--colour-surface-secondary);
    color: var(--colour-text);
  }

  .btn-secondary :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-bg-light);
  }

  .btn-danger {
    background: var(--dracula-red);
    color: var(--dracula-fg);
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dracula-red), black 15%);
  }
</style>
