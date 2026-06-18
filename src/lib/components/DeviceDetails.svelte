<!--
  DeviceDetails Component
  Displays detailed information about a device.
  Used in bottom sheet (mobile) and potentially edit panel (desktop).
  When verbs are supplied, the action buttons are projected from the shared
  actions registry (metadata + enabledWhen) and dispatched by action id, so
  mobile and desktop share one source of truth for command labels, availability,
  and behaviour.
-->
<script lang="ts">
  import type { PlacedDevice, DeviceType, RackView } from "$lib/types";
  import type { ActionId } from "$lib/actions/registry";
  import type { SelectionVerbItem } from "$lib/actions/verb-bars";
  import CategoryIcon from "./CategoryIcon.svelte";
  import {
    IconChevronUp,
    IconChevronDown,
    IconTrash,
    IconFlip,
    IconCopy,
  } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { formatPosition, UNITS_PER_U } from "$lib/utils/position";

  interface Props {
    device: PlacedDevice;
    deviceType: DeviceType;
    rackView?: RackView;
    rackHeight?: number;
    /** Show action buttons - used on mobile */
    showActions?: boolean;
    /**
     * Registry-projected selection verbs with disabled state. When supplied
     * (with onaction), the action buttons render from the registry instead of
     * the legacy bespoke callbacks.
     */
    verbs?: SelectionVerbItem[];
    /** Dispatch a registry verb by action id. */
    onaction?: (id: ActionId) => void;
  }

  let {
    device,
    deviceType,
    rackView: _rackView = "front",
    rackHeight: _rackHeight,
    showActions = false,
    verbs = [],
    onaction,
  }: Props = $props();

  // Display name: custom name if set, otherwise device type model/slug
  const displayName = $derived(
    device.name ?? deviceType.model ?? deviceType.slug,
  );

  // Format position display as whole-U (e.g., "U12-U13, Front" or "U1, Front")
  const positionDisplay = $derived.by(() => {
    // Format bottom position
    const bottomPosition = formatPosition(device.position);

    // Calculate top position in internal units and format
    const topInternal =
      device.position + (deviceType.u_height - 1) * UNITS_PER_U;
    const topPosition = formatPosition(topInternal);

    // For multi-U devices, show range; for 1U devices, show single position
    const positionStr =
      deviceType.u_height === 1
        ? bottomPosition
        : `${bottomPosition}-${topPosition}`;

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

  // Resolve individual verbs from the projected list. Each is undefined when
  // the registry did not include it (e.g. move-device-slot is absent for
  // full-width devices), so the template guards with {#if}.
  const moveUpVerb = $derived(verbs.find((v) => v.id === "move-device-up"));
  const moveDownVerb = $derived(verbs.find((v) => v.id === "move-device-down"));
  const flipVerb = $derived(verbs.find((v) => v.id === "flip-device-face"));
  const duplicateVerb = $derived(
    verbs.find((v) => v.id === "duplicate-selection"),
  );
  const deleteVerb = $derived(verbs.find((v) => v.id === "delete-selection"));

  function dispatch(id: ActionId) {
    onaction?.(id);
  }
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

  <!-- Action buttons (mobile), projected from the actions registry -->
  {#if showActions && verbs.length > 0}
    <div class="detail-section actions-section">
      {#if moveUpVerb || moveDownVerb}
        <div class="move-buttons">
          {#if moveUpVerb}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => dispatch(moveUpVerb.id)}
              disabled={moveUpVerb.disabled}
              aria-label={moveUpVerb.label}
            >
              <IconChevronUp />
              {moveUpVerb.label}
            </button>
          {/if}
          {#if moveDownVerb}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => dispatch(moveDownVerb.id)}
              disabled={moveDownVerb.disabled}
              aria-label={moveDownVerb.label}
            >
              <IconChevronDown />
              {moveDownVerb.label}
            </button>
          {/if}
        </div>
      {/if}
      {#if flipVerb}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => dispatch(flipVerb.id)}
          disabled={flipVerb.disabled}
          aria-label={flipVerb.label}
        >
          <IconFlip size={ICON_SIZE.sm} />
          {flipVerb.label}
        </button>
      {/if}
      {#if duplicateVerb}
        <button
          type="button"
          class="btn btn-secondary"
          onclick={() => dispatch(duplicateVerb.id)}
          disabled={duplicateVerb.disabled}
          aria-label={duplicateVerb.label}
        >
          <IconCopy size={ICON_SIZE.sm} />
          {duplicateVerb.label}
        </button>
      {/if}
      {#if deleteVerb}
        <button
          type="button"
          class="btn btn-danger"
          onclick={() => dispatch(deleteVerb.id)}
          disabled={deleteVerb.disabled}
          aria-label={deleteVerb.label}
        >
          <IconTrash size={ICON_SIZE.sm} />
          {deleteVerb.label}
        </button>
      {/if}
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
