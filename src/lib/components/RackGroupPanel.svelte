<!--
  RackGroupPanel Component
  Displays and manages rack groups in the sidebar
  Allows viewing group members, changing layout preset, and deleting groups
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import type { RackGroup, RackGroupLayoutPreset } from "$lib/types";
  import { IconClose } from "./icons";

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  const groups = $derived(layoutStore.rack_groups);

  /**
   * Get display names for racks in a group (limited to first 3)
   */
  function getRackNames(group: RackGroup): string[] {
    return group.rack_ids
      .map((id) => layoutStore.getRackById(id)?.name ?? id)
      .slice(0, 3);
  }

  /**
   * Handle delete group button click
   */
  function handleDeleteGroup(groupId: string, groupName?: string) {
    layoutStore.deleteRackGroup(groupId);
    toastStore.showToast(
      `Deleted group "${groupName ?? "Unnamed"}"`,
      "info",
      3000,
    );
  }

  /**
   * Handle layout preset change
   */
  function handlePresetChange(groupId: string, preset: RackGroupLayoutPreset) {
    const result = layoutStore.updateRackGroup(groupId, {
      layout_preset: preset,
    });
    if (result.error) {
      toastStore.showToast(result.error, "warning", 4000);
    }
  }
</script>

{#if groups.length > 0}
  <div class="groups-panel">
    <h3 class="panel-heading">Groups</h3>
    {#each groups as group (group.id)}
      <div class="group-card">
        <div class="group-header">
          <span class="group-name">{group.name ?? "Unnamed Group"}</span>
          <button
            type="button"
            class="delete-btn"
            onclick={() => handleDeleteGroup(group.id, group.name)}
            aria-label="Delete group {group.name ?? 'unnamed'}"
            title="Delete group (keeps racks)"
          >
            <IconClose />
          </button>
        </div>
        <div class="group-racks">
          {#each getRackNames(group) as name, index (name + index)}
            <span class="rack-chip">{name}</span>
          {/each}
          {#if group.rack_ids.length > 3}
            <span class="rack-chip more">+{group.rack_ids.length - 3}</span>
          {/if}
        </div>
        <div class="group-preset">
          <label class="preset-label">
            <input
              type="radio"
              name="preset-{group.id}"
              value="row"
              checked={group.layout_preset !== "bayed"}
              onchange={() => handlePresetChange(group.id, "row")}
            />
            <span class="preset-text">Row</span>
          </label>
          <label class="preset-label">
            <input
              type="radio"
              name="preset-{group.id}"
              value="bayed"
              checked={group.layout_preset === "bayed"}
              onchange={() => handlePresetChange(group.id, "bayed")}
            />
            <span class="preset-text">Bayed</span>
          </label>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .groups-panel {
    padding: var(--space-3);
    border-bottom: 1px solid var(--colour-border);
  }

  .panel-heading {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--colour-text-muted);
    margin: 0 0 var(--space-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-card {
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-2);
  }

  .group-card:last-child {
    margin-bottom: 0;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-1);
  }

  .group-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    opacity: 0.6;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .delete-btn :global(svg) {
    width: var(--icon-size-sm);
    height: var(--icon-size-sm);
  }

  .delete-btn:hover {
    opacity: 1;
    color: var(--colour-error);
    background: var(--colour-surface-hover);
  }

  .delete-btn:focus-visible {
    opacity: 1;
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .group-racks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .rack-chip {
    background: var(--colour-surface-hover);
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    padding: 2px var(--space-1-5, 6px);
    border-radius: var(--radius-sm);
  }

  .rack-chip.more {
    color: var(--colour-text-disabled);
    font-style: italic;
  }

  .group-preset {
    display: flex;
    gap: var(--space-3);
  }

  .preset-label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
  }

  .preset-label input[type="radio"] {
    accent-color: var(--colour-selection);
    cursor: pointer;
  }

  .preset-text {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    transition: color var(--duration-fast);
  }

  .preset-label:hover .preset-text {
    color: var(--colour-text);
  }

  .preset-label input[type="radio"]:checked + .preset-text {
    color: var(--colour-text);
    font-weight: var(--font-weight-medium);
  }
</style>
