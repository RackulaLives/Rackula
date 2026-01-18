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
  let rackToDelete = $state<{
    id: string;
    name: string;
    isGroup?: boolean;
    deviceCount?: number;
  } | null>(null);

  const racks = $derived(layoutStore.racks);
  const activeRackId = $derived(layoutStore.activeRackId);
  const canAddRack = $derived(layoutStore.canAddRack);
  const rackGroups = $derived(layoutStore.rack_groups);

  // Get set of rack IDs that belong to groups
  const groupedRackIds = $derived(
    new Set(rackGroups.flatMap((g) => g.rack_ids)),
  );

  // Ungrouped racks only
  const ungroupedRacks = $derived(
    racks.filter((r) => !groupedRackIds.has(r.id)),
  );

  // Get total device count for a bayed rack group
  function getGroupDeviceCount(group: { rack_ids: string[] }): number {
    return group.rack_ids.reduce((sum, rackId) => {
      const rack = layoutStore.getRackById(rackId);
      return sum + (rack?.devices.length ?? 0);
    }, 0);
  }

  // Get the first rack in a group (for height info)
  function getGroupFirstRack(group: { rack_ids: string[] }) {
    if (!group.rack_ids || group.rack_ids.length === 0) return undefined;
    return layoutStore.getRackById(group.rack_ids[0]);
  }

  function handleRackClick(rackId: string) {
    layoutStore.setActiveRack(rackId);
    selectionStore.selectRack(rackId);
  }

  function handleGroupClick(groupId: string) {
    const group = rackGroups.find((g) => g.id === groupId);
    if (group && group.rack_ids.length > 0) {
      // Select the first rack in the group to make the whole group active
      layoutStore.setActiveRack(group.rack_ids[0]);
      selectionStore.selectRack(group.rack_ids[0]);
    }
  }

  function handleDeleteClick(
    event: MouseEvent,
    rack: { id: string; name: string },
  ) {
    event.stopPropagation(); // Prevent rack selection
    rackToDelete = rack;
    deleteConfirmOpen = true;
  }

  function handleGroupDeleteClick(
    event: MouseEvent,
    group: { id: string; name?: string; rack_ids: string[] },
  ) {
    event.stopPropagation();
    // Check for devices in any bay
    const deviceCount = getGroupDeviceCount(group);
    rackToDelete = {
      id: group.id,
      name: group.name ?? "Bayed Rack",
      isGroup: true,
      deviceCount,
    };
    deleteConfirmOpen = true;
  }

  function confirmDelete() {
    if (rackToDelete) {
      if (rackToDelete.isGroup) {
        // Delete all racks in the group, then the group
        const group = rackGroups.find((g) => g.id === rackToDelete.id);
        if (group) {
          // Delete racks first
          for (const rackId of group.rack_ids) {
            layoutStore.deleteRack(rackId);
          }
          // Group auto-deletes when last rack removed
        }
        toastStore.showToast(
          `Deleted "${rackToDelete.name}"${rackToDelete.deviceCount ? ` (${rackToDelete.deviceCount} devices removed)` : ""}`,
          "info",
        );
      } else {
        const deviceCount =
          layoutStore.getRackById(rackToDelete.id)?.devices.length ?? 0;
        layoutStore.deleteRack(rackToDelete.id);
        toastStore.showToast(
          `Deleted "${rackToDelete.name}"${deviceCount > 0 ? ` (${deviceCount} devices removed)` : ""}`,
          "info",
        );
      }
      selectionStore.clearSelection();
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
    if (rackToDelete.isGroup) {
      const count = rackToDelete.deviceCount ?? 0;
      if (count > 0) {
        return `Delete "${rackToDelete.name}"? This will remove ${count} device${count === 1 ? "" : "s"} across all bays.`;
      }
      return `Delete "${rackToDelete.name}"? All bays will be removed.`;
    }
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
    <span class="rack-count">
      {rackGroups.length + ungroupedRacks.length} rack{rackGroups.length +
        ungroupedRacks.length !==
      1
        ? "s"
        : ""}
    </span>
  </div>

  <div class="rack-items" role="listbox" aria-label="Rack list">
    <!-- Bayed rack groups as single entries -->
    {#each rackGroups as group (group.id)}
      {@const firstRack = getGroupFirstRack(group)}
      {@const isActive = group.rack_ids.includes(activeRackId ?? "")}
      {@const deviceCount = getGroupDeviceCount(group)}
      {@const bayCount = group.rack_ids.length}
      <div
        class="rack-item"
        class:active={isActive}
        onclick={() => handleGroupClick(group.id)}
        onkeydown={(e) => {
          if (e.key === " ") e.preventDefault();
          if (e.key === "Enter" || e.key === " ") handleGroupClick(group.id);
        }}
        role="option"
        aria-selected={isActive}
        tabindex="0"
        data-testid="rack-item-group-{group.id}"
      >
        <span class="rack-indicator" aria-hidden="true">
          {isActive ? "●" : "○"}
        </span>
        <span class="rack-info">
          <span class="rack-name">{group.name ?? "Bayed Rack"}</span>
          <span class="rack-meta"
            >{firstRack?.height ?? "?"}U · {bayCount}-bay · {deviceCount} device{deviceCount !==
            1
              ? "s"
              : ""}</span
          >
        </span>
        <button
          type="button"
          class="rack-delete"
          onclick={(e) => handleGroupDeleteClick(e, group)}
          aria-label="Delete {group.name ?? 'bayed rack'}"
          title="Delete bayed rack"
        >
          ✕
        </button>
      </div>
    {/each}

    <!-- Ungrouped racks -->
    {#each ungroupedRacks as rack (rack.id)}
      {@const isActive = rack.id === activeRackId}
      {@const deviceCount = rack.devices.length}
      <div
        class="rack-item"
        class:active={isActive}
        onclick={() => handleRackClick(rack.id)}
        onkeydown={(e) => {
          if (e.key === " ") e.preventDefault();
          if (e.key === "Enter" || e.key === " ") handleRackClick(rack.id);
        }}
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

    {#if rackGroups.length === 0 && ungroupedRacks.length === 0}
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
