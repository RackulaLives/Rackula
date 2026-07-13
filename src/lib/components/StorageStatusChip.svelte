<!--
  StorageStatusChip Component
  Workspace-wide storage status surfaced in the toolbar. Reads the single
  durability source (getLayoutDurability) and never recomputes status itself.
  Status-only: the chip shows save state and storage target and nothing else;
  its former dropdown actions (export now, back up all, restore) live in the
  app menu's file section, projected from the actions registry (#2446).

  Accessibility (#2064): state is conveyed by icon + text, never colour alone
  (WCAG 1.4.1). The visible chip is a <button> with an aria-label that carries
  the current storage state and location. Live announcements come from a
  separate hidden sr-only span (role="status" aria-live="polite") that is
  debounced so a screen reader is not spammed with intermediate save states.
-->
<script lang="ts">
  import { IconCheck, IconClock, IconWarningTriangle } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import {
    getLayoutDurability,
    getStorageMode,
    isStorageModeFromOverride,
    clearStorageModeOverride,
    getServerBaseUpdatedAt,
    getLayoutSavedAt,
  } from "$lib/storage";
  import { maybeSaveAs } from "$lib/utils/app-actions";
  import {
    evaluateBackupNudge,
    STORAGE_NOTICE_MESSAGE,
  } from "$lib/utils/backup-nudge";
  import { safeGetItem, safeSetItem } from "$lib/utils/safe-storage";
  import ServerAvailableBanner from "./ServerAvailableBanner.svelte";
  import { Popover } from "$lib/components/ui/Popover";
  import StorageDetailsPopover from "./StorageDetailsPopover.svelte";

  const layoutStore = getLayoutStore();
  const durability = getLayoutDurability(layoutStore);
  const toastStore = getToastStore();

  // Storage mode is fixed for the session (read once; mode switches reload the page).
  const isServerMode = getStorageMode() === "server";

  const locationWord = isServerMode ? "Server" : "Browser";
  const accessibleName = $derived(
    durability.showLocation
      ? `Storage status: ${durability.label}, ${locationWord}`
      : `Storage status: ${durability.label}`,
  );

  const DISMISS_KEY = "Rackula:server-hint-dismissed";

  let dismissed = $state(safeGetItem(DISMISS_KEY) === "1");

  // durability is the existing reactive value already used to render the chip.
  const showServerBanner = $derived(durability.serverHint && !dismissed);
  const fromOverride = isStorageModeFromOverride();

  function dismissBanner() {
    dismissed = true;
    safeSetItem(DISMISS_KEY, "1");
  }

  function switchBackToBrowser() {
    clearStorageModeOverride();
    window.location.reload();
  }

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
        toastStore.showToast(STORAGE_NOTICE_MESSAGE, "info", 8000, {
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

  let open = $state(false);
  let nowMs = $state(Date.now());
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  // Clear a pending close timer if the component is destroyed while hovering.
  $effect(() => () => clearTimeout(closeTimer));

  // Recompute the popover's relative times only while it is open.
  $effect(() => {
    if (!open) return;
    nowMs = Date.now();
    const id = setInterval(() => {
      nowMs = Date.now();
    }, 30_000);
    return () => clearInterval(id);
  });

  function hoverOpen(event: PointerEvent) {
    if (event.pointerType === "touch") return; // touch uses tap
    clearTimeout(closeTimer);
    open = true;
  }
  function hoverClose(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      open = false;
    }, 150);
  }

  // Timestamp sources for the popover, read on open. Browser: the layout's last
  // localStorage write (autosave) plus its last export. Server: the last server save.
  // Reading durability.status ensures these re-run when save state changes while open.
  const layoutId = $derived(layoutStore.layout.metadata?.id ?? null);
  const autosaveAt = $derived(
    open && !isServerMode && layoutId
      ? (durability.status, getLayoutSavedAt(layoutId))
      : null,
  );
  const serverSavedAt = $derived(
    open && isServerMode ? (durability.status, getServerBaseUpdatedAt()) : null,
  );
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="storage-chip storage-chip-{durability.status}"
        class:storage-chip--attention={durability.serverHint}
        aria-label={accessibleName}
        data-testid="storage-status-chip"
        onpointerenter={hoverOpen}
        onpointerleave={hoverClose}
      >
        {#if durability.icon === "saved"}
          <IconCheck size={ICON_SIZE.sm} />
        {:else if durability.icon === "pending"}
          <IconClock size={ICON_SIZE.sm} />
        {:else}
          <IconWarningTriangle size={ICON_SIZE.sm} />
        {/if}
        <span class="storage-chip-state">{durability.shortLabel}</span>
        {#if durability.showLocation}
          <span class="storage-chip-sep" aria-hidden="true">.</span>
          <span class="storage-chip-loc">{locationWord}</span>
        {/if}
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      class="storage-chip-popover"
      side="bottom"
      sideOffset={8}
      onpointerenter={() => clearTimeout(closeTimer)}
      onpointerleave={hoverClose}
    >
      <StorageDetailsPopover
        mode={isServerMode ? "server" : "browser"}
        kind={durability.kind}
        headline={durability.label}
        icon={durability.icon}
        changesSinceExport={durability.changesSinceExport}
        lastExportedAt={durability.lastExportedAt}
        {autosaveAt}
        {serverSavedAt}
        {nowMs}
      />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

{#if showServerBanner}
  <ServerAvailableBanner onDismiss={dismissBanner} />
{/if}

{#if fromOverride}
  <button
    type="button"
    class="storage-chip-reverse"
    onclick={switchBackToBrowser}
  >
    Switch back to browser mode
  </button>
{/if}

<span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {announced}
</span>

<style>
  .storage-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    font-size: var(--font-size-xs);
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
  }

  /* Mobile (#3001): the visible chip stays 28px tall; a transparent overlay
     grows the tap target to the project's touch-target minimum without
     changing the rendered size. */
  @media (max-width: 1024px) {
    .storage-chip::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: max(100%, var(--touch-target-min));
      height: var(--touch-target-min);
    }
  }

  .storage-chip:hover,
  .storage-chip[data-state="open"] {
    background: var(--colour-surface-hover);
  }
  .storage-chip:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-glow);
  }
  :global(.storage-chip-popover) {
    background: var(--colour-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, 0 12px 30px rgba(0, 0, 0, 0.45));
    z-index: var(--z-popover, 50);
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

  .storage-chip-state {
    font-weight: 600;
    white-space: nowrap;
  }

  /* Location is secondary: muted so the coloured state word leads. */
  .storage-chip-sep,
  .storage-chip-loc {
    color: var(--colour-text-muted);
    font-weight: 500;
  }

  /* Draws attention when a server is reachable in browser mode. */
  .storage-chip--attention {
    border-color: var(--colour-warning);
    background: var(--colour-warning-bg);
  }

  .storage-chip-reverse {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .storage-chip-reverse:hover {
    border-color: var(--colour-border-hover);
    color: var(--colour-text);
  }
</style>
