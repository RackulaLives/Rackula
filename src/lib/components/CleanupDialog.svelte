<!--
  CleanupDialog Component
  Bulk cleanup dialog for selecting and deleting multiple unused custom device types.
  Supports Select All / Deselect All, shows count, and enables single undo operation.
-->
<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import Dialog from "./Dialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCategoryDisplayName } from "$lib/utils/deviceFilters";
  import type { DeviceType } from "$lib/types";

  interface Props {
    open: boolean;
    onclose?: () => void;
  }

  let { open = $bindable(), onclose }: Props = $props();

  const layoutStore = getLayoutStore();

  // Get unused custom device types reactively
  const unusedDeviceTypes = $derived(layoutStore.getUnusedCustomDeviceTypes());

  // Track selected slugs using SvelteSet for reactivity
  const selectedSlugs = new SvelteSet<string>();

  // Track previous open state to detect dialog opening
  let wasOpen = false;

  // Reset selection when dialog opens (transition from closed to open)
  $effect(() => {
    if (open && !wasOpen) {
      // Select all by default when opening
      selectedSlugs.clear();
      for (const dt of unusedDeviceTypes) {
        selectedSlugs.add(dt.slug);
      }
    }
    // Track open state for next comparison - this is intentional side effect tracking
    wasOpen = open;
  });

  // Derived state
  const selectedCount = $derived(selectedSlugs.size);
  const allSelected = $derived(
    unusedDeviceTypes.length > 0 &&
      selectedSlugs.size === unusedDeviceTypes.length,
  );
  const hasUnused = $derived(unusedDeviceTypes.length > 0);

  function toggleDevice(slug: string) {
    if (selectedSlugs.has(slug)) {
      selectedSlugs.delete(slug);
    } else {
      selectedSlugs.add(slug);
    }
  }

  function selectAll() {
    for (const dt of unusedDeviceTypes) {
      selectedSlugs.add(dt.slug);
    }
  }

  function deselectAll() {
    selectedSlugs.clear();
  }

  function handleDelete() {
    if (selectedCount === 0) return;

    const slugsToDelete = Array.from(selectedSlugs);
    layoutStore.deleteMultipleDeviceTypesRecorded(slugsToDelete);

    handleClose();
  }

  function handleClose() {
    open = false;
    onclose?.();
  }

  function getCategoryLabel(dt: DeviceType): string {
    return getCategoryDisplayName(dt.category);
  }
</script>

<Dialog
  {open}
  title="Clean Up Device Library"
  onclose={handleClose}
  width="480px"
>
  <div class="cleanup-dialog">
    {#if hasUnused}
      <p class="summary">
        {unusedDeviceTypes.length} unused custom device type{unusedDeviceTypes.length ===
        1
          ? ""
          : "s"}
      </p>

      <div class="select-buttons">
        <button
          type="button"
          class="btn btn-text"
          onclick={selectAll}
          disabled={allSelected}
        >
          Select All
        </button>
        <button
          type="button"
          class="btn btn-text"
          onclick={deselectAll}
          disabled={selectedCount === 0}
        >
          Deselect All
        </button>
      </div>

      <div class="device-list" role="group" aria-label="Unused device types">
        {#each unusedDeviceTypes as deviceType (deviceType.slug)}
          <label class="device-item">
            <input
              type="checkbox"
              checked={selectedSlugs.has(deviceType.slug)}
              onchange={() => toggleDevice(deviceType.slug)}
            />
            <span class="device-name">{deviceType.name}</span>
            <span class="device-category">({getCategoryLabel(deviceType)})</span
            >
          </label>
        {/each}
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn btn-destructive"
          onclick={handleDelete}
          disabled={selectedCount === 0}
        >
          Delete Selected ({selectedCount})
        </button>
        <button type="button" class="btn btn-secondary" onclick={handleClose}>
          Cancel
        </button>
      </div>
    {:else}
      <p class="empty-state">No unused device types found.</p>
      <div class="actions actions-centered">
        <button type="button" class="btn btn-secondary" onclick={handleClose}>
          Close
        </button>
      </div>
    {/if}
  </div>
</Dialog>

<style>
  .cleanup-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .summary {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--colour-text-secondary);
  }

  .select-buttons {
    display: flex;
    gap: var(--space-3);
  }

  .btn-text {
    background: none;
    border: none;
    color: var(--colour-selection);
    font-size: var(--font-size-sm);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .btn-text:hover:not(:disabled) {
    background: var(--colour-button-bg);
  }

  .btn-text:disabled {
    color: var(--colour-text-muted);
    cursor: not-allowed;
  }

  .device-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 300px;
    overflow-y: auto;
    padding: var(--space-2);
    background: var(--colour-panel-bg);
    border-radius: var(--radius-md);
    border: 1px solid var(--colour-border);
  }

  .device-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .device-item:hover {
    background: var(--colour-hover);
  }

  .device-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--colour-selection);
  }

  .device-name {
    flex: 1;
    color: var(--colour-text);
    font-size: var(--font-size-base);
  }

  .device-category {
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: 1px solid var(--colour-border);
  }

  .actions-centered {
    justify-content: center;
  }

  .empty-state {
    margin: 0;
    text-align: center;
    color: var(--colour-text-secondary);
    font-size: var(--font-size-base);
    padding: var(--space-6) 0;
  }

  .btn {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--colour-button-hover);
  }

  .btn-destructive {
    background: var(--colour-error);
    color: var(--colour-text-inverse);
  }

  .btn-destructive:hover:not(:disabled) {
    background: var(--colour-error-hover);
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
