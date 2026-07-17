<!--
  EditPanelActions Component
  Edit panel section: destructive actions for the selected device
  (remove from rack, delete custom device type from library).
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { isCustomDevice } from "$lib/utils/device-lookup";
  import type { SelectedDeviceInfo } from "$lib/types";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
    ondeletetype?: () => void;
  }

  let { selectedDeviceInfo, ondeletetype }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();

  // Check if selected device is a custom (user-created) device
  const isSelectedDeviceCustom = $derived.by(() =>
    isCustomDevice(selectedDeviceInfo.device.slug),
  );

  // Remove device from rack. Immediate with an undo toast rather than a
  // confirm dialog: a device placement is trivially undoable, and the toast
  // keeps this affordance consistent with the other four device-removal
  // paths (#2993).
  function handleRemoveDevice() {
    const name = layoutStore.removeDeviceFromRack(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
    );
    selectionStore.clearSelection();
    if (name) {
      toastStore.showUndoToast(`Removed ${name}`, () => layoutStore.undo());
    }
  }
</script>

<div class="actions">
  <button
    type="button"
    class="btn-remove"
    onclick={handleRemoveDevice}
    aria-label="Remove from rack"
  >
    Remove from Rack
  </button>
  {#if isSelectedDeviceCustom}
    <button
      type="button"
      class="btn-delete-type"
      onclick={() => ondeletetype?.()}
      aria-label="Delete from library"
    >
      Delete from Library
    </button>
  {/if}
</div>

<style>
  .actions {
    margin-top: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /*
    Remove from Rack affects a single placement, so it gets a quieter
    ghost-danger treatment: destructive red is retained, but it no longer
    dominates the panel's primary editing controls.
  */
  .btn-remove {
    align-self: flex-start;
    padding: var(--space-1-5) var(--space-3);
    background: transparent;
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-sm);
    color: var(--colour-error);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast),
      color var(--duration-fast);
  }

  .btn-remove:hover {
    background: var(--colour-error-bg);
  }

  /*
    Delete from Library removes the device type across every instance, a far
    larger blast radius, so it keeps the loud full-width solid-danger styling
    to read as the more serious action.
  */
  .btn-delete-type {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--colour-error);
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-sm);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .btn-delete-type:hover {
    background: var(--colour-error-hover);
  }
</style>
