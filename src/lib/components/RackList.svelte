<!--
  RackList Component
  Displays list of all racks with selection and delete actions
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  interface Props {
    onaddrack?: () => void;
  }

  let { onaddrack }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  const toastStore = getToastStore();

  // Delete confirmation state
  let deleteConfirmOpen = $state(false);
  let rackToDelete = $state<{ id: string; name: string } | null>(null);

  const racks = $derived(layoutStore.racks);
  const activeRackId = $derived(layoutStore.activeRackId);
  const canAddRack = $derived(layoutStore.canAddRack);

  function handleRackClick(rackId: string) {
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
  }

  function handleDeleteClick(
    event: MouseEvent,
    rack: { id: string; name: string },
  ) {
    event.stopPropagation(); // Prevent rack selection
    rackToDelete = rack;
    deleteConfirmOpen = true;
  }

  function confirmDelete() {
    if (rackToDelete) {
      const deviceCount =
        layoutStore.getRackById(rackToDelete.id)?.devices.length ?? 0;
      layoutStore.deleteRack(rackToDelete.id);
      selectionStore.clearSelection();
      toastStore.showToast(
        `Deleted "${rackToDelete.name}"${deviceCount > 0 ? ` (${deviceCount} devices removed)` : ""}`,
        "info",
      );
    }
    deleteConfirmOpen = false;
    rackToDelete = null;
  }

  function cancelDelete() {
    deleteConfirmOpen = false;
    rackToDelete = null;
  }

  function getDeleteMessage(): string {
    if (!rackToDelete) return "";
    const deviceCount =
      layoutStore.getRackById(rackToDelete.id)?.devices.length ?? 0;
    if (deviceCount > 0) {
      return `Delete "${rackToDelete.name}"? This will remove ${deviceCount} device${deviceCount === 1 ? "" : "s"}.`;
    }
    return `Delete "${rackToDelete.name}"? This rack is empty.`;
  }
</script>

<div class="rack-list">
  <div class="rack-list-header">
    <span class="rack-count"
      >{racks.length} rack{racks.length !== 1 ? "s" : ""}</span
    >
  </div>

  <div class="rack-items" role="listbox" aria-label="Rack list">
    {#each racks as rack (rack.id)}
      {@const isActive = rack.id === activeRackId}
      {@const deviceCount = rack.devices.length}
      <div
        class="rack-item"
        class:active={isActive}
        onclick={() => handleRackClick(rack.id)}
        onkeydown={(e) =>
          (e.key === "Enter" || e.key === " ") && handleRackClick(rack.id)}
        role="option"
        aria-selected={isActive}
        tabindex="0"
        data-testid="rack-item-{rack.id}"
      >
        <span class="rack-indicator" aria-hidden="true">
          {isActive ? "●" : "○"}
        </span>
        <span class="rack-info">
          <span class="rack-name">{rack.name}</span>
          <span class="rack-meta"
            >{rack.height}U · {deviceCount} device{deviceCount !== 1
              ? "s"
              : ""}</span
          >
        </span>
        <button
          type="button"
          class="rack-delete"
          onclick={(e) =>
            handleDeleteClick(e, { id: rack.id, name: rack.name })}
          aria-label="Delete {rack.name}"
          title="Delete rack"
        >
          ✕
        </button>
      </div>
    {/each}

    {#if racks.length === 0}
      <div class="empty-state">
        <p class="empty-message">No racks yet</p>
        <p class="empty-hint">Create your first rack to get started</p>
      </div>
    {/if}
  </div>

  {#if canAddRack}
    <button
      type="button"
      class="add-rack-btn"
      onclick={onaddrack}
      data-testid="btn-add-rack-sidebar"
    >
      <span class="add-icon">+</span>
      Add Rack
    </button>
  {:else}
    <p class="rack-limit-message">Maximum 10 racks reached</p>
  {/if}
</div>

<ConfirmDialog
  open={deleteConfirmOpen}
  title="Delete Rack"
  message={getDeleteMessage()}
  confirmLabel="Delete"
  onconfirm={confirmDelete}
  oncancel={cancelDelete}
/>

<style>
  .rack-list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .rack-list-header {
    padding: var(--space-3);
    border-bottom: 1px solid var(--colour-border);
  }

  .rack-count {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .rack-items {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .rack-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .rack-item:hover {
    background: var(--colour-surface-hover);
  }

  .rack-item.active {
    background: var(--colour-surface-active);
    border-color: var(--colour-selection);
  }

  .rack-item:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .rack-indicator {
    flex-shrink: 0;
    color: var(--colour-selection);
  }

  .rack-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5, 2px);
    min-width: 0;
  }

  .rack-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rack-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .rack-delete {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .rack-item:hover .rack-delete,
  .rack-item:focus-within .rack-delete {
    opacity: 1;
  }

  .rack-delete:hover {
    background: var(--colour-error);
    color: var(--colour-text-on-error, #fff);
  }

  .rack-delete:focus-visible {
    opacity: 1;
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    text-align: center;
  }

  .empty-message {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .empty-hint {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .add-rack-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .add-rack-btn:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-selection);
  }

  .add-rack-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .add-icon {
    font-size: var(--font-size-lg);
    font-weight: bold;
  }

  .rack-limit-message {
    margin: var(--space-3);
    padding: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    text-align: center;
  }
</style>
