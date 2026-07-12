<!--
  EditPanelPosition Component
  Edit panel section: whole-U vertical position controls for the selected
  device, plus container context when the device is a child in a slot.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { isContainerChild } from "$lib/utils/collision";
  import { formatDisplayPosition as formatDisplayPositionShared } from "$lib/utils/position";
  import { canMoveUp, canMoveDown } from "$lib/utils/device-movement";
  import {
    moveSelectedDeviceUp,
    moveSelectedDeviceDown,
  } from "$lib/actions/selection-actions";
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
  // numbering direction and starting_unit offset. Delegates to the shared
  // helper (position.ts). Previously omitted starting_unit, so a rack whose
  // numbering starts above U1 showed a label that diverged from the ruler;
  // passing it through here brings this display in line with the ruler for
  // those racks (CodeAnt, PR #3018, comment 3566108076).
  function formatDisplayPosition(position: number, rack: Rack): string {
    return formatDisplayPositionShared(
      position,
      rack.height,
      rack.desc_units,
      rack.starting_unit,
    );
  }

  // Whether the selected device can move up/down. Delegates to the shared
  // collision-aware helpers from device-movement so desktop, keyboard, and
  // mobile all use the same reachability logic.
  const canMoveDeviceUp = $derived.by(() => {
    if (isChildDevice) return false;
    const { rack, deviceIndex } = selectedDeviceInfo;
    return canMoveUp(rack, layoutStore.device_types, deviceIndex);
  });

  const canMoveDeviceDown = $derived.by(() => {
    if (isChildDevice) return false;
    const { rack, deviceIndex } = selectedDeviceInfo;
    return canMoveDown(rack, layoutStore.device_types, deviceIndex);
  });

  // Transform internal position to a whole-U display label.
  // PlacedDevice.position is in internal units (multiples of UNITS_PER_U for rails).
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
          onclick={moveSelectedDeviceDown}
          disabled={!canMoveDeviceDown}
          aria-label="Move device down by 1 rack unit"
          title="Move down 1U"
        >
          <span class="arrow-label">↓</span>
        </button>
        <button
          type="button"
          class="position-btn"
          onclick={moveSelectedDeviceUp}
          disabled={!canMoveDeviceUp}
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

  /* Neutral form-control vocabulary shared with the edit panel's colour swatch
     and the palette create/filter buttons (#2524): input-bg fill, input-border,
     selection border on hover and focus. 44px square keeps the touch standard
     (#2100). */
  .position-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
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
    border-color: var(--colour-selection);
  }

  .position-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .position-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
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
