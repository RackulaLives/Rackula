<!--
  EditPanelPosition Component
  Edit panel section: whole-U vertical position controls for the selected
  device, plus container context when the device is a child in a slot.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { canPlaceDevice, isContainerChild } from "$lib/utils/collision";
  import {
    toHumanUnits,
    toInternalUnits,
    formatPosition,
  } from "$lib/utils/position";
  import type { Rack, SelectedDeviceInfo } from "$lib/types";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
  }

  let { selectedDeviceInfo }: Props = $props();

  const layoutStore = getLayoutStore();

  // Container children use container-relative positions; a rack-level move
  // (what layoutStore.moveDevice does) would detach them from their container.
  // The vertical Position controls are inert for children, matching the
  // keyboard nudge path. Deliberate detachment happens via drag-out.
  const isChildDevice = $derived(
    isContainerChild(selectedDeviceInfo.placedDevice),
  );

  // Format an internal-unit position for display, honouring the rack's U
  // numbering direction (desc_units flips the whole-U part, keeps the fraction).
  function formatDisplayPosition(position: number, rack: Rack): string {
    if (!rack.desc_units) return formatPosition(position);
    const positionU = toHumanUnits(position);
    const wholeU = Math.floor(positionU);
    const fraction = positionU - wholeU;
    const displayWholeU = rack.height - wholeU + 1 - (fraction > 0 ? 1 : 0);
    return formatPosition(toInternalUnits(displayWholeU + fraction));
  }

  /**
   * Move device up or down by one whole rack unit. Rails register equipment at
   * whole-U boundaries only (carrier-first model).
   * @param direction - 1 for up (higher U), -1 for down (lower U)
   */
  function moveDevice(direction: number) {
    // A rack-level move would eject a container child from its container.
    if (isChildDevice) return;

    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;

    // Convert internal units to human U for calculations
    const currentPositionU = toHumanUnits(placedDevice.position);

    // Calculate new position in human U
    let newPositionU = currentPositionU + direction;

    // Clamp to valid range (human U: 1 to rack.height)
    if (newPositionU < 1) newPositionU = 1;
    if (newPositionU + device.u_height - 1 > rack.height) {
      newPositionU = rack.height - device.u_height + 1;
    }

    // Check if new position is valid (canPlaceDevice expects internal units)
    // Face is authoritative: the device's face value determines blocking
    const isValid = canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      toInternalUnits(newPositionU),
      deviceIndex,
      placedDevice.face,
    );

    if (isValid) {
      // layoutStore.moveDevice expects human U
      layoutStore.moveDevice(
        selectedDeviceInfo.rack.id,
        deviceIndex,
        newPositionU,
      );
    }
  }

  // Check if device can move up
  const canMoveUp = $derived.by(() => {
    if (isChildDevice) return false;
    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;
    // Convert to human U and add 1
    const newPositionU = toHumanUnits(placedDevice.position) + 1;
    if (newPositionU + device.u_height - 1 > rack.height) return false;
    // canPlaceDevice expects internal units
    return canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      toInternalUnits(newPositionU),
      deviceIndex,
      placedDevice.face,
    );
  });

  // Check if device can move down
  const canMoveDown = $derived.by(() => {
    if (isChildDevice) return false;
    const { device, placedDevice, rack, deviceIndex } = selectedDeviceInfo;
    // Convert to human U and subtract 1
    const newPositionU = toHumanUnits(placedDevice.position) - 1;
    if (newPositionU < 1) return false;
    // canPlaceDevice expects internal units
    return canPlaceDevice(
      rack,
      layoutStore.device_types,
      device.u_height,
      toInternalUnits(newPositionU),
      deviceIndex,
      placedDevice.face,
    );
  });

  // Transform internal position to display position with fraction glyphs
  // PlacedDevice.position is in internal units (1/6U)
  // Display with desc_units=false: U1 at bottom (ascending)
  // Display with desc_units=true: U1 at top (descending)
  const displayPosition = $derived.by(() =>
    formatDisplayPosition(
      selectedDeviceInfo.placedDevice.position,
      selectedDeviceInfo.rack,
    ),
  );

  // Get container context if device is a child (has container_id)
  const containerContext = $derived.by(() => {
    const { placedDevice, rack } = selectedDeviceInfo;

    // Check if this is a child device
    if (!placedDevice.container_id) return null;

    // Find parent container
    const container = rack.devices.find(
      (d) => d.id === placedDevice.container_id,
    );
    if (!container) return null;

    const containerType = layoutStore.device_types.find(
      (d) => d.slug === container.device_type,
    );
    if (!containerType) return null;

    // Find the slot
    const slot = containerType.slots?.find(
      (s) => s.id === placedDevice.slot_id,
    );

    return {
      // Prefer custom name on container, then fall back to type model/slug
      containerName:
        container.name ?? containerType.model ?? containerType.slug,
      containerPosition: formatDisplayPosition(container.position, rack),
      slotName: slot?.name ?? placedDevice.slot_id ?? "Unknown",
    };
  });
</script>

<!-- Container context for child devices -->
{#if containerContext}
  <div class="container-context">
    <div class="context-header">
      <svg
        class="context-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <line x1="2" y1="9" x2="22" y2="9" />
        <line x1="2" y1="15" x2="22" y2="15" />
      </svg>
      <span class="context-label">Inside Container</span>
    </div>
    <div class="context-details">
      <div class="context-row">
        <span class="context-key">Container</span>
        <span class="context-value">{containerContext.containerName}</span>
      </div>
      <div class="context-row">
        <span class="context-key">Container U</span>
        <span class="context-value">{containerContext.containerPosition}</span>
      </div>
      <div class="context-row">
        <span class="context-key">Slot</span>
        <span class="context-value">{containerContext.slotName}</span>
      </div>
    </div>
  </div>
{/if}

<div class="info-section">
  <div class="info-row position-row">
    <span class="info-label">Position</span>
    <div class="position-controls">
      <span class="info-value position-value">{displayPosition}</span>
      <div class="position-buttons">
        <button
          type="button"
          class="position-btn"
          onclick={() => moveDevice(-1)}
          disabled={!canMoveDown}
          aria-label="Move device down by 1 rack unit"
          title="Move down 1U"
        >
          <span class="arrow-label">↓</span>
        </button>
        <button
          type="button"
          class="position-btn"
          onclick={() => moveDevice(1)}
          disabled={!canMoveUp}
          aria-label="Move device up by 1 rack unit"
          title="Move up 1U"
        >
          <span class="arrow-label">↑</span>
        </button>
      </div>
    </div>
  </div>
  <p class="helper-text position-hint">Use ↑↓ keys to move device</p>
</div>

<style>
  .info-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .info-label {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .info-value {
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .helper-text {
    font-size: var(--font-size-sm);
    margin: 0;
    color: var(--colour-text-muted);
  }

  /* Position controls */
  .position-row {
    align-items: flex-start;
  }

  .position-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .position-value {
    min-width: 2.5em;
    font-variant-numeric: tabular-nums;
  }

  .position-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .position-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--button-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    cursor: pointer;
    transition:
      background-color var(--duration-fast),
      border-color var(--duration-fast);
  }

  .position-btn :global(svg) {
    width: var(--icon-size-xs);
    height: var(--icon-size-xs);
  }

  .position-btn:hover:not(:disabled) {
    background: var(--button-bg-hover);
    border-color: var(--colour-selection);
  }

  .position-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .position-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .arrow-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1;
  }

  .position-hint {
    margin-top: var(--space-1);
  }

  /* Container context for child devices */
  .container-context {
    background: var(--colour-surface-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  .context-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-weight: var(--font-weight-semibold);
    color: var(--dracula-purple);
  }

  .context-icon {
    flex-shrink: 0;
  }

  .context-label {
    font-size: var(--font-size-sm);
  }

  .context-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .context-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-sm);
  }

  .context-key {
    color: var(--colour-text-muted);
  }

  .context-value {
    color: var(--colour-text);
  }
</style>
