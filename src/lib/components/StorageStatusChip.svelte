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
  import ConfirmReplaceDialog from "./ConfirmReplaceDialog.svelte";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import {
    getLayoutDurability,
    loadFromFile,
    getStorageMode,
    getServerInstanceLabel,
    handleExportAll,
    handleSaveAsArchive,
  } from "$lib/storage";
  import { maybeSaveAs, shouldShowCleanupPrompt } from "$lib/utils/app-actions";
  import { evaluateBackupNudge, NUDGE_MESSAGE } from "$lib/utils/backup-nudge";
  import "$lib/styles/menu.css";

  const layoutStore = getLayoutStore();
  const durability = getLayoutDurability(layoutStore);
  const toastStore = getToastStore();

  // Storage mode is fixed for the session (read once from runtime config), so
  // the export-all framing is computed up front rather than tracked reactively.
  const isServerMode = getStorageMode() === "server";
  const exportAllLabel = isServerMode ? "Export a copy" : "Back up all layouts";
  const exportAllSubtext = isServerMode
    ? `Your layouts are stored on ${getServerInstanceLabel()}; this makes a portable copy.`
    : null;

  let open = $state(false);
  let exportingAll = $state(false);
  let restoreConfirmOpen = $state(false);

  // Backup nudge: browser mode only, per the epic signal budget (#2071). Server
  // mode persists to the server, so an export reminder would be noise. The nudge
  // tracks changesSinceExport and fires a factual toast when a new checkpoint is
  // crossed; evaluateBackupNudge owns the cadence and snooze persistence.
  if (!isServerMode) {
    $effect(() => {
      // Keyed by the stable per-layout id (layout.metadata.id, the UUID that
      // survives renames and reloads), not the per-tab id which nextTabId()
      // regenerates on every reload/restore. A per-tab key would let persisted
      // checkpoints drift across reloads and re-fire or attach to the wrong
      // layout.
      const layoutId = layoutStore.layout.metadata?.id;
      if (!layoutId) return;
      const changes = layoutStore.changesSinceExport;
      const exported = layoutStore.hasEverExported;
      evaluateBackupNudge(layoutId, changes, exported, () => {
        toastStore.showToast(NUDGE_MESSAGE, "info", 8000, {
          label: "Export",
          onClick: () => {
            maybeSaveAs();
          },
        });
      });
    });
  }

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

  function handleRestore() {
    open = false;
    // Restoring replaces the working copy. Confirm first only when there are
    // changes not yet in any exported file; a fully backed-up copy goes straight
    // to the picker.
    if (layoutStore.changesSinceExport > 0) {
      restoreConfirmOpen = true;
    } else {
      void loadFromFile();
    }
  }

  function handleRestoreCancel() {
    restoreConfirmOpen = false;
  }

  function handleRestoreReplace() {
    restoreConfirmOpen = false;
    void loadFromFile();
  }

  async function handleRestoreExportFirst() {
    restoreConfirmOpen = false;
    // Route through the same cleanup-prompt contract as the other save-as
    // paths: when unused custom device types exist, the prompt is shown and the
    // export is deferred into the cleanup dialog. The restore does not chain in
    // that case (the user is now in the cleanup flow), matching maybeSaveAs's
    // fire-and-forget contract.
    if (shouldShowCleanupPrompt("saveAs")) return;
    // Turn the dangerous moment into the backup moment: export, then restore
    // only if the export actually succeeded (not cancelled or failed).
    const exported = await handleSaveAsArchive();
    if (exported) {
      await loadFromFile();
    }
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
      <p class="storage-chip-detail">{durability.detail}</p>
      {#if durability.serverHint}
        <p class="storage-chip-hint" data-testid="storage-chip-server-hint">
          A Rackula server is reachable but this instance stores layouts in the
          browser. Set RACKULA_STORAGE_MODE=server to use it.
        </p>
      {/if}
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

<ConfirmReplaceDialog
  open={restoreConfirmOpen}
  title="Replace this layout?"
  message="This layout has changes that are not in any exported file. Restoring replaces it with the file you choose."
  saveFirstLabel="Export first"
  onSaveFirst={handleRestoreExportFirst}
  onReplace={handleRestoreReplace}
  onCancel={handleRestoreCancel}
/>

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

  /* Passive misconfiguration note: a server is reachable while this instance
     stores layouts in the browser. Factual tone, popover only, no toast. The
     left rule and inset set it apart from the state/detail lines without a new
     colour or an alarm treatment. */
  .storage-chip-hint {
    margin: 0 var(--space-2) var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-left: 2px solid var(--colour-border);
    font-size: var(--font-size-xs);
    line-height: var(--line-height-snug, 1.4);
    color: var(--colour-text-muted-inverse);
    white-space: normal;
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
