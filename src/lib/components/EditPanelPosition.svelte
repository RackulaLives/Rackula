<!--
  EditPanelPosition Component
  Edit panel section: whole-U vertical position controls for the selected
  device, plus container context when the device is a child in a slot.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { isContainerChild } from "$lib/utils/collision";
  import { formatDisplayPosition as formatDisplayPositionShared } from "$lib/utils/position";
  import {
    canMoveUp,
    canMoveDown,
    canMoveChildCell,
  } from "$lib/utils/device-movement";
  import {
    moveSelectedDeviceUp,
    moveSelectedDeviceDown,
    moveSelectedDeviceLeft,
    moveSelectedDeviceRight,
  } from "$lib/actions/selection-actions";
  import type { Rack, SelectedDeviceInfo } from "$lib/types";
  import type { CellDirection } from "$lib/utils/collision";
  import { isGeneratedCarrier } from "$lib/utils/custom-carrier";
  import { canRotate, getRotation } from "$lib/utils/device-width";
  import { gapsFor } from "$lib/utils/slot-layout";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
  }

  let { selectedDeviceInfo }: Props = $props();

  const layoutStore = getLayoutStore();

  // Container children use container-relative positions; a rack-level move
  // (what layoutStore.moveDevice does) would detach them from their container.
  // For a child the controls move it between the cells of its carrier instead,
  // through the same actions as the arrow keys (#3340). Deliberate detachment
  // happens via drag-out.
  const isChildDevice = $derived(
    isContainerChild(selectedDeviceInfo.placedDevice),
  );

  function canMoveCell(direction: CellDirection): boolean {
    const { rack, deviceIndex } = selectedDeviceInfo;
    return canMoveChildCell(
      rack,
      layoutStore.device_types,
      deviceIndex,
      direction,
    );
  }

  // Only a measured device turns, and it always sits in a carrier.
  const canTurn = $derived(
    isChildDevice && canRotate(selectedDeviceInfo.device),
  );
  const rotation = $derived(
    getRotation(
      selectedDeviceInfo.device,
      selectedDeviceInfo.placedDevice.rotation,
    ),
  );

  function rotateDevice() {
    const { rack, deviceIndex } = selectedDeviceInfo;
    layoutStore.rotateDevice(rack.id, deviceIndex);
  }

  const canMoveChildLeft = $derived(isChildDevice && canMoveCell("left"));
  const canMoveChildRight = $derived(isChildDevice && canMoveCell("right"));

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
    if (isChildDevice) return canMoveCell("up");
    const { rack, deviceIndex } = selectedDeviceInfo;
    return canMoveUp(rack, layoutStore.device_types, deviceIndex);
  });

  const canMoveDeviceDown = $derived.by(() => {
    if (isChildDevice) return canMoveCell("down");
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

  // The gaps of a selected generated carrier. A gap belongs to the carrier and
  // to a position between two cells, so it is edited here, on the carrier,
  // and never on one of the devices sitting in it.
  const editableGaps = $derived.by(() => {
    const { placedDevice } = selectedDeviceInfo;
    if (placedDevice.container_id) return null;
    const type = layoutStore.device_types.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (!type || !isGeneratedCarrier(type)) return null;
    const gaps = gapsFor(type);
    return gaps.length > 0 ? gaps : null;
  });

  function setGap(index: number, mm: number): void {
    const gaps = editableGaps;
    if (!gaps) return;
    const next = [...gaps];
    next[index] = Math.max(0, mm);
    layoutStore.updateDeviceTypeSlotGaps(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.placedDevice.id,
      next,
    );
  }
</script>

<!-- Gaps between the cells of a custom split -->
{#if editableGaps}
  <div class="info-section gap-editor">
    <h4 class="section-title">Gaps (mm)</h4>
    {#each editableGaps as gap, index (index)}
      <div class="gap-row">
        <label for="slot-gap-{index}">
          Between cell {index + 1} and cell {index + 2}
        </label>
        <input
          id="slot-gap-{index}"
          type="number"
          min="0"
          step="1"
          value={gap}
          onchange={(e) => setGap(index, Number(e.currentTarget.value))}
        />
      </div>
    {/each}
  </div>
{/if}

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
    <span class="info-label">{isChildDevice ? "Cell" : "Position"}</span>
    <div class="position-controls">
      <span class="info-value position-value"
        >{isChildDevice ? containerContext?.slotName : displayPosition}</span
      >
      <div class="position-buttons">
        {#if isChildDevice}
          <button
            type="button"
            class="position-btn"
            onclick={moveSelectedDeviceLeft}
            disabled={!canMoveChildLeft}
            aria-label="Move device to the cell on the left"
            title="Move to cell left"
          >
            <span class="arrow-label">←</span>
          </button>
        {/if}
        <button
          type="button"
          class="position-btn"
          onclick={moveSelectedDeviceDown}
          disabled={!canMoveDeviceDown}
          aria-label={isChildDevice
            ? "Move device to the cell below"
            : "Move device down by 1 rack unit"}
          title={isChildDevice ? "Move to cell below" : "Move down 1U"}
        >
          <span class="arrow-label">↓</span>
        </button>
        <button
          type="button"
          class="position-btn"
          onclick={moveSelectedDeviceUp}
          disabled={!canMoveDeviceUp}
          aria-label={isChildDevice
            ? "Move device to the cell above"
            : "Move device up by 1 rack unit"}
          title={isChildDevice ? "Move to cell above" : "Move up 1U"}
        >
          <span class="arrow-label">↑</span>
        </button>
        {#if isChildDevice}
          <button
            type="button"
            class="position-btn"
            onclick={moveSelectedDeviceRight}
            disabled={!canMoveChildRight}
            aria-label="Move device to the cell on the right"
            title="Move to cell right"
          >
            <span class="arrow-label">→</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
  <p class="helper-text position-hint">
    {isChildDevice
      ? "Use arrow keys to move between cells"
      : "Use ↑↓ keys to move device"}
  </p>
  {#if canTurn}
    <div class="info-row position-row">
      <span class="info-label">Rotation</span>
      <div class="position-controls">
        <span class="info-value position-value" data-testid="device-rotation"
          >{rotation}°</span
        >
        <div class="position-buttons">
          <button
            type="button"
            class="position-btn"
            data-testid="btn-rotate-device"
            onclick={rotateDevice}
            aria-label="Rotate device 90 degrees clockwise"
            title="Rotate 90° clockwise"
          >
            <span class="arrow-label">↻</span>
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .gap-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2, 0.5rem);
  }

  .gap-row label {
    font-size: var(--font-size-sm, 0.8125rem);
    color: var(--neutral-400);
  }

  .gap-row input {
    width: 5rem;
  }

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
