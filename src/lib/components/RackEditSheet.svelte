<!--
  RackEditSheet Component
  Mobile bottom sheet for editing rack properties
  Feature parity with EditPanel's rack editing section
-->
<script lang="ts">
  import { untrack } from "svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import {
    canResizeRackTo,
    getConflictDetails,
    formatConflictMessage,
  } from "$lib/utils/rack-resize";
  import { COMMON_RACK_HEIGHTS } from "$lib/types/constants";
  import type { Rack } from "$lib/types";

  interface Props {
    rack: Rack;
    onclose?: () => void;
  }

  let { rack, onclose }: Props = $props();

  const layoutStore = getLayoutStore();
  const canvasStore = getCanvasStore();

  // Local state for form fields (synced from rack prop)
  // Using untrack() to capture initial values - the $effect below handles reactive updates
  let rackName = $state(untrack(() => rack.name));
  let rackHeight = $state(untrack(() => rack.height));
  let rackNotes = $state(untrack(() => rack.notes ?? ""));
  let resizeError = $state<string | null>(null);

  // State for clear rack confirmation
  let showClearConfirm = $state(false);

  // Device count for clear confirmation
  const deviceCount = $derived(rack.devices.length);

  // Sync form fields when rack prop changes
  $effect(() => {
    rackName = rack.name;
    rackHeight = rack.height;
    rackNotes = rack.notes ?? "";
    resizeError = null;
  });

  // Update rack name on blur
  function handleNameBlur() {
    if (rackName !== rack.name) {
      layoutStore.updateRack(rack.id, { name: rackName });
    }
  }

  // Update rack name on Enter
  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  }

  // Update rack notes on blur
  function handleNotesBlur() {
    const trimmedNotes = rackNotes.trim();
    const notesToSave = trimmedNotes === "" ? undefined : trimmedNotes;
    if (notesToSave !== rack.notes) {
      layoutStore.updateRack(rack.id, { notes: notesToSave });
    }
  }

  // Validate and apply height change
  function attemptHeightChange(newHeight: number): boolean {
    // Validate the resize
    const validation = canResizeRackTo(
      rack,
      newHeight,
      layoutStore.device_types,
    );

    if (!validation.allowed) {
      const conflicts = getConflictDetails(
        validation.conflicts,
        layoutStore.device_types,
      );
      resizeError = formatConflictMessage(conflicts);
      rackHeight = rack.height; // Reset to current
      return false;
    }

    // Clear error and apply change
    resizeError = null;
    layoutStore.updateRack(rack.id, { height: newHeight });
    // Reset view to center the resized rack
    canvasStore.fitAll(layoutStore.rack ? [layoutStore.rack] : []);
    return true;
  }

  // Update rack height on input change
  function handleHeightChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newHeight = parseInt(target.value, 10);
    if (newHeight >= 1 && newHeight <= 100) {
      attemptHeightChange(newHeight);
    }
  }

  // Handle preset button click
  function handlePresetClick(preset: number) {
    rackHeight = preset;
    attemptHeightChange(preset);
  }

  // Clear all devices from rack
  function handleClearRack() {
    showClearConfirm = true;
  }

  function confirmClearRack() {
    layoutStore.clearRackDevices(rack.id);
    showClearConfirm = false;
    onclose?.();
  }
</script>

<div class="rack-edit-sheet">
  <div class="edit-form">
    <!-- Rack Name -->
    <div class="form-group">
      <label for="rack-name-mobile">Name</label>
      <input
        type="text"
        id="rack-name-mobile"
        class="input-field"
        bind:value={rackName}
        onblur={handleNameBlur}
        onkeydown={handleNameKeydown}
      />
    </div>

    <!-- Rack Height -->
    <div class="form-group">
      <label for="rack-height-mobile">Height</label>
      <input
        type="number"
        id="rack-height-mobile"
        class="input-field"
        class:error={resizeError !== null}
        bind:value={rackHeight}
        onchange={handleHeightChange}
        min="1"
        max="100"
      />
      {#if resizeError}
        <p class="helper-text error">Cannot resize: {resizeError}</p>
      {/if}
      <div class="height-presets">
        {#each COMMON_RACK_HEIGHTS as preset (preset)}
          <button
            type="button"
            class="preset-btn"
            class:active={rackHeight === preset}
            onclick={() => handlePresetClick(preset)}
          >
            {preset}U
          </button>
        {/each}
      </div>
    </div>

    <!-- U Numbering Direction -->
    <div class="form-group">
      <label for="rack-numbering-mobile">U Numbering</label>
      <SegmentedControl
        options={[
          { value: "bottom", label: "U1 at bottom" },
          { value: "top", label: "U1 at top" },
        ]}
        value={rack.desc_units ? "top" : "bottom"}
        onchange={(value) =>
          layoutStore.updateRack(rack.id, {
            desc_units: value === "top",
          })}
        ariaLabel="U numbering direction"
      />
    </div>

    <!-- Show Rear View Toggle -->
    <div class="form-group">
      <label for="show-rear-view-mobile">Show Rear View</label>
      <SegmentedControl
        options={[
          { value: "show", label: "Show" },
          { value: "hide", label: "Hide" },
        ]}
        value={rack.show_rear ? "show" : "hide"}
        onchange={(value) =>
          layoutStore.updateRack(rack.id, {
            show_rear: value === "show",
          })}
        ariaLabel="Show rear view on canvas"
      />
    </div>

    <!-- Notes -->
    <div class="form-group">
      <label for="rack-notes-mobile">Notes</label>
      <textarea
        id="rack-notes-mobile"
        class="input-field textarea"
        bind:value={rackNotes}
        onblur={handleNotesBlur}
        rows="3"
        placeholder="Add notes about this rack..."
      ></textarea>
    </div>

    <!-- Clear Rack Action -->
    <div class="actions">
      <button
        type="button"
        class="btn-danger"
        onclick={handleClearRack}
        disabled={deviceCount === 0}
        aria-label="Clear all devices from rack"
      >
        Clear Rack ({deviceCount}
        {deviceCount === 1 ? "device" : "devices"})
      </button>
    </div>
  </div>
</div>

<!-- Clear Rack Confirmation Dialog -->
<ConfirmDialog
  bind:open={showClearConfirm}
  title="Clear Rack"
  message="Remove all {deviceCount} {deviceCount === 1
    ? 'device'
    : 'devices'} from this rack? This action can be undone."
  confirmText="Clear"
  danger={true}
  onconfirm={confirmClearRack}
/>

<style>
  .rack-edit-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
    padding-top: var(--space-2);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .form-group label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-secondary);
  }

  .input-field {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-base);
    color: var(--colour-text);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
    /* Ensure touch-friendly sizing */
    min-height: var(--touch-target-min);
  }

  .input-field:focus {
    outline: none;
    border-color: var(--colour-focus-ring);
    box-shadow: 0 0 0 2px var(--colour-focus-ring-alpha);
  }

  .input-field.error {
    border-color: var(--colour-error);
  }

  .input-field.textarea {
    resize: vertical;
    min-height: calc(var(--touch-target-min) * 2);
  }

  .helper-text {
    font-size: var(--font-size-xs);
    margin: 0;
  }

  .helper-text.error {
    color: var(--colour-error);
  }

  .height-presets {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-secondary);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
    /* Touch-friendly size */
    min-height: var(--touch-target-min);
    min-width: var(--touch-target-min);
  }

  .preset-btn:hover,
  .preset-btn:focus-visible {
    background: var(--colour-surface-hover);
    border-color: var(--colour-border-hover);
  }

  .preset-btn.active {
    background: var(--colour-selection);
    border-color: var(--colour-selection);
    color: var(--colour-text-on-selection);
  }

  .preset-btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding-top: var(--space-4);
    border-top: 1px solid var(--colour-border);
  }

  .btn-danger {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--colour-error);
    background: transparent;
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
    /* Touch-friendly size */
    min-height: var(--touch-target-min);
  }

  .btn-danger:hover:not(:disabled),
  .btn-danger:focus-visible:not(:disabled) {
    background: var(--colour-error);
    color: var(--colour-text-on-primary);
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }
</style>
