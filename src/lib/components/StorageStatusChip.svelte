<!--
  StorageStatusChip Component
  Workspace-wide storage status surfaced in the toolbar. Reads the single
  durability source (getLayoutDurability) and never recomputes status itself.
  Status-only: the chip shows save state and storage target and nothing else;
  its former dropdown actions (export now, back up all, restore) live in the
  app menu's file section, projected from the actions registry (#2446).

  Accessibility (#2064): state is conveyed by icon + text, never colour alone
  (WCAG 1.4.1). The chip is a non-interactive status indicator (role="status"),
  so its text content is its accessible name. The save->saved debounce cascade
  produces several intermediate statuses in quick succession; the aria-live
  region is debounced so only the settled state reaches a screen reader.
-->
<script lang="ts">
  import { IconCheck, IconClock, IconWarningTriangle } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getLayoutDurability, getStorageMode } from "$lib/storage";
  import { maybeSaveAs } from "$lib/utils/app-actions";
  import { evaluateBackupNudge, NUDGE_MESSAGE } from "$lib/utils/backup-nudge";

  const layoutStore = getLayoutStore();
  const durability = getLayoutDurability(layoutStore);
  const toastStore = getToastStore();

  // Storage mode is fixed for the session (read once from runtime config).
  const isServerMode = getStorageMode() === "server";

  // Backup nudge: browser mode only, per the epic signal budget (#2071). Server
  // mode persists to the server, so an export reminder would be noise. The nudge
  // tracks changesSinceExport and fires a factual toast when a new checkpoint is
  // crossed; evaluateBackupNudge owns the cadence and snooze persistence. The
  // toast's Export action routes through maybeSaveAs directly, independent of
  // the chip UI.
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
</script>

<div
  class="storage-chip storage-chip-{durability.status}"
  role="status"
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
</div>

<!-- Settled-state announcer: aria-live region debounced from the chip text so a
     screen reader hears the final state once, not every intermediate status. -->
<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {announced}
</span>

<style>
  .storage-chip {
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
  }

  /* Colour reinforces, never replaces, the icon + text. */
  .storage-chip-saved {
    color: var(--colour-success);
  }

  .storage-chip-pending {
    color: var(--colour-warning);
  }

  .storage-chip-error {
    color: var(--colour-error);
  }

  .storage-chip-text {
    white-space: nowrap;
  }
</style>
