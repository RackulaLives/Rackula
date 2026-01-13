<!--
  RackGroupManager Component
  UI for managing rack groups with presets (bayed, row, custom)
  Issue: #476
-->
<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import type { RackGroup, LayoutPreset } from "$lib/types";

  const layoutStore = getLayoutStore();
  const _selectionStore = getSelectionStore(); // Reserved for future multi-select integration
  const toastStore = getToastStore();

  // State
  let isCreating = $state(false);
  let newGroupName = $state("");
  let newGroupPreset = $state<LayoutPreset>("row");
  let selectedRackIds = new SvelteSet<string>();
  let editingGroupId = $state<string | null>(null);
  let editingName = $state("");
  let editingPreset = $state<LayoutPreset>("row");
  let deleteConfirmOpen = $state(false);
  let groupToDelete = $state<RackGroup | null>(null);

  // Derived
  const rack_groups = $derived(layoutStore.rack_groups);
  const racks = $derived(layoutStore.racks);

  // Get the racks in a specific group
  function getRacksInGroup(group: RackGroup) {
    return group.rack_ids
      .map((id) => racks.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
  }

  // Toggle rack selection for group creation
  function toggleRackSelection(rackId: string) {
    if (selectedRackIds.has(rackId)) {
      selectedRackIds.delete(rackId);
    } else {
      selectedRackIds.add(rackId);
    }
  }

  // Check if rack can be added to bayed group (same height)
  function canAddToBayedGroup(rackId: string): boolean {
    if (newGroupPreset !== "bayed" || selectedRackIds.size === 0) return true;

    const rack = racks.find((r) => r.id === rackId);
    if (!rack) return false;

    const firstSelectedId = Array.from(selectedRackIds)[0];
    const firstRack = racks.find((r) => r.id === firstSelectedId);
    if (!firstRack) return true;

    return rack.height === firstRack.height;
  }

  // Check if a rack is already in any group
  function isRackInGroup(rackId: string): boolean {
    return rack_groups.some((g) => g.rack_ids.includes(rackId));
  }

  // Start creating a new group
  function startCreating() {
    isCreating = true;
    newGroupName = "";
    newGroupPreset = "row";
    selectedRackIds.clear();
  }

  // Cancel group creation
  function cancelCreating() {
    isCreating = false;
    newGroupName = "";
    selectedRackIds.clear();
  }

  // Create the new group
  function createGroup() {
    if (selectedRackIds.size === 0) {
      toastStore.showToast("Select at least one rack", "error");
      return;
    }

    const name = newGroupName.trim() || `Group ${rack_groups.length + 1}`;
    const result = layoutStore.createRackGroup(
      name,
      Array.from(selectedRackIds),
      newGroupPreset,
    );

    if (result.error) {
      toastStore.showToast(result.error, "error");
      return;
    }

    toastStore.showToast(`Created group "${name}"`, "success");
    cancelCreating();
  }

  // Start editing a group
  function startEditing(group: RackGroup) {
    editingGroupId = group.id;
    editingName = group.name;
    editingPreset = group.layout_preset ?? "row";
  }

  // Save group edits
  function saveEdits() {
    if (!editingGroupId) return;

    const updates: Partial<RackGroup> = {};
    const currentGroup = layoutStore.getRackGroupById(editingGroupId);
    if (!currentGroup) return;

    if (editingName !== currentGroup.name) {
      updates.name = editingName;
    }
    if (editingPreset !== currentGroup.layout_preset) {
      updates.layout_preset = editingPreset;
    }

    if (Object.keys(updates).length > 0) {
      const result = layoutStore.updateRackGroup(editingGroupId, updates);
      if (result.error) {
        toastStore.showToast(result.error, "error");
        return;
      }
      toastStore.showToast("Group updated", "success");
    }

    editingGroupId = null;
  }

  // Cancel editing
  function cancelEditing() {
    editingGroupId = null;
  }

  // Request group deletion
  function requestDelete(group: RackGroup) {
    groupToDelete = group;
    deleteConfirmOpen = true;
  }

  // Confirm deletion
  function confirmDelete() {
    if (groupToDelete) {
      layoutStore.deleteRackGroup(groupToDelete.id);
      toastStore.showToast(`Deleted group "${groupToDelete.name}"`, "info");
    }
    deleteConfirmOpen = false;
    groupToDelete = null;
  }

  // Cancel deletion
  function cancelDelete() {
    deleteConfirmOpen = false;
    groupToDelete = null;
  }

  // Get preset display name
  function getPresetLabel(preset: LayoutPreset | undefined): string {
    switch (preset) {
      case "bayed":
        return "Bayed";
      case "row":
        return "Row";
      case "custom":
        return "Custom";
      default:
        return "Row";
    }
  }

  // Get preset icon
  function getPresetIcon(preset: LayoutPreset | undefined): string {
    switch (preset) {
      case "bayed":
        return "▐▐▐"; // Side-by-side
      case "row":
        return "═══"; // Horizontal line
      case "custom":
        return "◇"; // Diamond for flexibility
      default:
        return "═══";
    }
  }
</script>

<div class="rack-group-manager">
  <div class="section-header">
    <span class="section-title">Rack Groups</span>
    <span class="group-count">({rack_groups.length})</span>
  </div>

  {#if rack_groups.length === 0 && !isCreating}
    <div class="empty-state">
      <p class="empty-message">No groups yet</p>
      <p class="empty-hint">
        Group racks together with layout presets for bayed or row arrangements
      </p>
    </div>
  {/if}

  <!-- Existing groups list -->
  <div class="groups-list">
    {#each rack_groups as group (group.id)}
      {@const isEditing = editingGroupId === group.id}
      {@const groupRacks = getRacksInGroup(group)}
      <div class="group-item" class:editing={isEditing}>
        {#if isEditing}
          <div class="edit-form">
            <input
              type="text"
              class="name-input"
              bind:value={editingName}
              placeholder="Group name"
            />
            <select class="preset-select" bind:value={editingPreset}>
              <option value="row">Row</option>
              <option value="bayed">Bayed (same height)</option>
              <option value="custom">Custom</option>
            </select>
            <div class="edit-actions">
              <button type="button" class="btn-save" onclick={saveEdits}>
                Save
              </button>
              <button type="button" class="btn-cancel" onclick={cancelEditing}>
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="group-header">
            <span
              class="preset-icon"
              title={getPresetLabel(group.layout_preset)}
            >
              {getPresetIcon(group.layout_preset)}
            </span>
            <div class="group-info">
              <span class="group-name">{group.name}</span>
              <span class="group-meta">
                {getPresetLabel(group.layout_preset)} · {groupRacks.length} rack{groupRacks.length !==
                1
                  ? "s"
                  : ""}
              </span>
            </div>
            <div class="group-actions">
              <button
                type="button"
                class="btn-edit"
                onclick={() => startEditing(group)}
                aria-label="Edit group"
                title="Edit"
              >
                ✎
              </button>
              <button
                type="button"
                class="btn-delete"
                onclick={() => requestDelete(group)}
                aria-label="Delete group"
                title="Delete"
              >
                ✕
              </button>
            </div>
          </div>
          <div class="group-racks">
            {#each groupRacks as rack (rack.id)}
              <span class="rack-badge">{rack.name}</span>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Create new group -->
  {#if isCreating}
    <div class="create-form">
      <div class="form-header">Create Group</div>
      <input
        type="text"
        class="name-input"
        bind:value={newGroupName}
        placeholder="Group name (optional)"
      />
      <select class="preset-select" bind:value={newGroupPreset}>
        <option value="row">Row arrangement</option>
        <option value="bayed">Bayed (same height required)</option>
        <option value="custom">Custom layout</option>
      </select>

      <div class="rack-selection">
        <div class="selection-label">Select racks to include:</div>
        <div class="rack-checkboxes">
          {#each racks as rack (rack.id)}
            {@const isSelected = selectedRackIds.has(rack.id)}
            {@const inOtherGroup = isRackInGroup(rack.id)}
            {@const canAdd = canAddToBayedGroup(rack.id)}
            <label
              class="rack-checkbox"
              class:disabled={inOtherGroup || !canAdd}
              class:selected={isSelected}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={inOtherGroup || (!isSelected && !canAdd)}
                onchange={() => toggleRackSelection(rack.id)}
              />
              <span class="rack-label">
                {rack.name}
                <span class="rack-height">({rack.height}U)</span>
              </span>
              {#if inOtherGroup}
                <span class="rack-note">In group</span>
              {:else if !canAdd && !isSelected}
                <span class="rack-note">Height mismatch</span>
              {/if}
            </label>
          {/each}
        </div>
      </div>

      <div class="form-actions">
        <button
          type="button"
          class="btn-create"
          onclick={createGroup}
          disabled={selectedRackIds.size === 0}
        >
          Create Group
        </button>
        <button type="button" class="btn-cancel" onclick={cancelCreating}>
          Cancel
        </button>
      </div>
    </div>
  {:else}
    <button type="button" class="btn-add-group" onclick={startCreating}>
      <span class="add-icon">+</span>
      Create Group
    </button>
  {/if}
</div>

<ConfirmDialog
  open={deleteConfirmOpen}
  title="Delete Group"
  message={groupToDelete
    ? `Delete group "${groupToDelete.name}"? The racks will remain but no longer be grouped.`
    : ""}
  confirmLabel="Delete"
  onconfirm={confirmDelete}
  oncancel={cancelDelete}
/>

<style>
  .rack-group-manager {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .section-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
  }

  .group-count {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .empty-state {
    padding: var(--space-4);
    text-align: center;
  }

  .empty-message {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .empty-hint {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-item {
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    transition: border-color var(--duration-fast) var(--ease-out);
  }

  .group-item:hover {
    border-color: var(--colour-border-hover, var(--colour-border));
  }

  .group-item.editing {
    border-color: var(--colour-selection);
  }

  .group-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .preset-icon {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    opacity: 0.7;
  }

  .group-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .group-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .group-actions {
    display: flex;
    gap: var(--space-1);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .group-item:hover .group-actions,
  .group-item:focus-within .group-actions {
    opacity: 1;
  }

  .btn-edit,
  .btn-delete {
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
    transition: all var(--duration-fast) var(--ease-out);
  }

  .btn-edit:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .btn-delete:hover {
    background: var(--colour-error);
    color: white;
  }

  .group-racks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--colour-border);
  }

  .rack-badge {
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-xs, 2px);
    color: var(--colour-text-muted);
  }

  .edit-form,
  .create-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-header {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--colour-text);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
  }

  .name-input,
  .preset-select {
    padding: var(--space-2);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
  }

  .name-input:focus,
  .preset-select:focus {
    outline: none;
    border-color: var(--colour-selection);
  }

  .rack-selection {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .selection-label {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .rack-checkboxes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 150px;
    overflow-y: auto;
    padding: var(--space-2);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }

  .rack-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    border-radius: var(--radius-xs, 2px);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .rack-checkbox:hover:not(.disabled) {
    background: var(--colour-surface-hover);
  }

  .rack-checkbox.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rack-checkbox.selected {
    background: var(--colour-surface-active);
  }

  .rack-checkbox input {
    margin: 0;
  }

  .rack-label {
    flex: 1;
    font-size: var(--font-size-sm);
    color: var(--colour-text);
  }

  .rack-height {
    color: var(--colour-text-muted);
  }

  .rack-note {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    font-style: italic;
  }

  .form-actions,
  .edit-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .btn-create,
  .btn-save {
    flex: 1;
    padding: var(--space-2);
    background: var(--colour-selection);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .btn-create:hover:not(:disabled),
  .btn-save:hover {
    filter: brightness(1.1);
  }

  .btn-create:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel {
    flex: 1;
    padding: var(--space-2);
    background: transparent;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .btn-cancel:hover {
    background: var(--colour-surface-hover);
  }

  .btn-add-group {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--colour-surface-secondary);
    border: 1px dashed var(--colour-border);
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .btn-add-group:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-selection);
    color: var(--colour-text);
  }

  .add-icon {
    font-size: var(--font-size-lg);
    font-weight: bold;
  }
</style>
