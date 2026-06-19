<!--
  MobileRacksSheet Component

  Body of the mobile Racks bottom sheet (#2461). Lists every rack in the current
  layout and, on tap, opens the existing RackEditSheet for that rack. This makes
  rack property editing (name, size, view) discoverable from the Racks tab
  instead of relying on the undiscoverable long-press shortcut.

  It reuses the rack-edit entry point that the long-press flow already uses
  (setActiveRack -> selectRack -> open the rackEdit sheet), so the rack-edit
  logic is not forked. Creating a rack raises the parent New Rack wizard via
  onnewrack, mirroring the Layouts sheet's New layout flow.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { IconPlusBold, IconChevronRight } from "$lib/components/icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type { Rack } from "$lib/types";

  interface Props {
    /** Raise the New Rack wizard so a rack can be added from this sheet. */
    onnewrack?: () => void;
    /** Dismiss the sheet (after opening a rack or starting a new one). */
    onclose?: () => void;
  }

  let { onnewrack, onclose }: Props = $props();

  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();

  const racks = $derived(layoutStore.racks);

  // Open the existing rack-edit sheet for the tapped rack. This routes through
  // the same verbs as the long-press flow (App.handleRackLongPress) so mobile
  // does not fork rack-edit logic: the rack becomes active and selected, the
  // racks sheet closes, and RackEditSheet renders the now-active rack.
  function openRack(rack: Rack) {
    layoutStore.setActiveRack(rack.id);
    selectionStore.selectRack(rack.id);
    onclose?.();
    dialogStore.openSheet("rackEdit");
  }

  // Raise the parent New Rack wizard, then dismiss the sheet. Mirrors the
  // Layouts sheet's New layout action.
  function handleNewRack() {
    onnewrack?.();
    onclose?.();
  }
</script>

<div class="mobile-racks-sheet">
  <button
    type="button"
    class="new-rack"
    onclick={handleNewRack}
    data-testid="mobile-new-rack"
  >
    <IconPlusBold size={ICON_SIZE.sm} />
    New rack
  </button>

  {#if racks.length === 0}
    <p class="empty">No racks yet. Add one to get started.</p>
  {:else}
    <div class="rack-list">
      {#each racks as rack (rack.id)}
        <button
          type="button"
          class="rack-row"
          onclick={() => openRack(rack)}
          data-testid="mobile-rack-row-{rack.id}"
        >
          <span class="row-info">
            <span class="row-name">{rack.name}</span>
            <span class="row-meta">
              {rack.height}U ·
              {rack.devices.length} device{rack.devices.length !== 1 ? "s" : ""}
            </span>
          </span>
          <IconChevronRight size={ICON_SIZE.sm} />
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mobile-racks-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-1) var(--space-4);
  }

  .new-rack {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .new-rack:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-text-muted);
  }

  .new-rack:active {
    background: var(--colour-surface-hover);
    scale: 0.98;
  }

  .new-rack:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .empty {
    margin: 0;
    padding: var(--space-4) 0;
    color: var(--colour-text-muted);
    text-align: center;
    font-size: var(--font-size-sm);
  }

  .rack-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .rack-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .rack-row:hover {
    background: var(--colour-surface-hover);
  }

  .rack-row:active {
    scale: 0.99;
  }

  .rack-row:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .row-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
  }

  .row-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .rack-row :global(svg) {
    flex-shrink: 0;
    color: var(--colour-text-muted);
  }
</style>
