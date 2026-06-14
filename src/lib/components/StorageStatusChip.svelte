<!--
  StorageStatusChip Component
  Workspace-wide storage status surfaced in the toolbar. Reads the single
  durability source (getLayoutDurability) and never recomputes status itself.

  Accessibility: state is conveyed by icon + text, never colour alone
  (WCAG 1.4.1). The button's accessible name carries the current state, and a
  visually-hidden live region announces settled state changes.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { IconCheck, IconClock, IconWarningTriangle } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import {
    getLayoutDurability,
    loadFromFile,
    getStorageMode,
    getServerInstanceLabel,
    handleExportAll,
  } from "$lib/storage";
  import { maybeSaveAs } from "$lib/utils/app-actions";
  import "$lib/styles/menu.css";

  const durability = getLayoutDurability(getLayoutStore());

  // Storage mode is fixed for the session (read once from runtime config), so
  // the export-all framing is computed up front rather than tracked reactively.
  const isServerMode = getStorageMode() === "server";
  const exportAllLabel = isServerMode
    ? "Export a copy"
    : "Back up all layouts";
  const exportAllSubtext = isServerMode
    ? `Your layouts are stored on ${getServerInstanceLabel()}; this makes a portable copy.`
    : null;

  let open = $state(false);
  let exportingAll = $state(false);

  // Announced only after the status settles. The save->saved debounce cascade
  // produces several intermediate statuses in quick succession; announcing every
  // one would spam a screen reader. We announce the label ~500ms after the last
  // change, so only the settled state reaches the live region.
  let announced = $state("");
  $effect(() => {
    const label = durability.label;
    const timer = setTimeout(() => {
      announced = label;
    }, 500);
    return () => clearTimeout(timer);
  });

  function handleExportNow() {
    // Routes through maybeSaveAs so the cleanup prompt and promptCleanupOnSave
    // preference apply consistently with the other save paths. Export embeds
    // images (#617) and round-trips unknown sections (#2208), so resetting
    // changesSinceExport on export is honest and the chip needs no separate
    // image-dropping warning state.
    maybeSaveAs();
    open = false;
  }

  async function handleExportAllClick() {
    if (exportingAll) return;
    exportingAll = true;
    try {
      await handleExportAll();
    } finally {
      exportingAll = false;
      open = false;
    }
  }

  async function handleRestore() {
    await loadFromFile();
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="storage-chip storage-chip-{durability.status}"
    aria-label={`Storage status: ${durability.label}`}
    data-testid="storage-status-chip"
  >
    {#if durability.icon === "saved"}
      <IconCheck size={ICON_SIZE.sm} />
    {:else if durability.icon === "pending"}
      <IconClock size={ICON_SIZE.sm} />
    {:else}
      <IconWarningTriangle size={ICON_SIZE.sm} />
    {/if}
    <span class="storage-chip-text">{durability.label}</span>
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      class="menu-content menu-inline storage-chip-popover"
      sideOffset={6}
      align="end"
    >
      <p class="storage-chip-state">{durability.label}</p>
      <p class="storage-chip-detail">
        {durability.mode === "server" ? "Saved to server" : "Stored in this browser"}
      </p>
      <div class="storage-chip-actions">
        <button
          type="button"
          class="storage-chip-action"
          onclick={handleExportNow}
          data-testid="storage-chip-export"
        >
          Export now
        </button>
        <button
          type="button"
          class="storage-chip-action storage-chip-action-stacked"
          onclick={handleExportAllClick}
          disabled={exportingAll}
          aria-busy={exportingAll}
          data-testid="storage-chip-export-all"
        >
          <span class="storage-chip-action-label">{exportAllLabel}</span>
          {#if exportAllSubtext}
            <span class="storage-chip-action-subtext">{exportAllSubtext}</span>
          {/if}
        </button>
        <button
          type="button"
          class="storage-chip-action"
          onclick={handleRestore}
          data-testid="storage-chip-restore"
        >
          Restore from file
        </button>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {announced}
</span>

<style>
  :global(.storage-chip) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    font-size: var(--font-size-xs);
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  :global(.storage-chip:hover) {
    background: var(--colour-surface-hover);
  }

  :global(.storage-chip:focus-visible) {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  /* Colour reinforces, never replaces, the icon + text. */
  :global(.storage-chip-saved) {
    color: var(--colour-success);
  }

  :global(.storage-chip-pending) {
    color: var(--colour-warning);
  }

  :global(.storage-chip-error) {
    color: var(--colour-error);
  }

  :global(.storage-chip-text) {
    white-space: nowrap;
  }

  :global(.storage-chip-popover) {
    min-width: 200px;
  }

  .storage-chip-state {
    margin: 0;
    padding: var(--space-1) var(--space-2) 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text-inverse);
  }

  .storage-chip-detail {
    margin: 0;
    padding: 0 var(--space-2) var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted-inverse);
  }

  .storage-chip-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .storage-chip-action {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
  }

  .storage-chip-action-stacked {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .storage-chip-action-label {
    font-weight: var(--font-weight-medium);
  }

  .storage-chip-action-subtext {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted-inverse);
    white-space: normal;
  }

  .storage-chip-action:hover {
    background-color: var(--colour-overlay-hover);
  }

  .storage-chip-action:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--colour-focus-ring);
  }

  .storage-chip-action:disabled {
    cursor: default;
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .storage-chip-action {
      transition: none;
    }
  }
</style>
