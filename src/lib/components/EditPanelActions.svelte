<!--
  EditPanelActions Component
  Edit panel section: destructive actions for the selected device
  (remove from rack, delete custom device type from library).
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { isCustomDevice } from "$lib/utils/device-lookup";
  import type { SelectedDeviceInfo } from "$lib/types";

  interface Props {
    selectedDeviceInfo: SelectedDeviceInfo;
    ondeletetype?: () => void;
  }

  let { selectedDeviceInfo, ondeletetype }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  // Check if selected device is a custom (user-created) device
  const isSelectedDeviceCustom = $derived.by(() =>
    isCustomDevice(selectedDeviceInfo.device.slug),
  );

  // Remove device from rack
  function handleRemoveDevice() {
    layoutStore.removeDeviceFromRack(
      selectedDeviceInfo.rack.id,
      selectedDeviceInfo.deviceIndex,
    );
    selectionStore.clearSelection();
  }
</script>

<div class="actions">
  <button
    type="button"
    class="btn-danger"
    onclick={handleRemoveDevice}
    aria-label="Remove from rack"
  >
    Remove from Rack
  </button>
  {#if isSelectedDeviceCustom}
    <button
      type="button"
      class="btn-danger btn-delete-type"
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
  }

  .btn-danger {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--colour-error);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--duration-fast);
  }

  .btn-danger:hover {
    background: var(--colour-error-hover);
  }

  .btn-delete-type {
    margin-top: var(--space-2);
  }
</style>
