<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import {
    switchToServerMode,
    confirmServerOverwrite,
    adoptServerCopy,
    type ServerCopyInfo,
    type SwitchResult,
  } from "$lib/storage";

  // Shown only when the parent determines a server is reachable in browser mode.
  let { onDismiss }: { onDismiss: () => void } = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  let confirming = $state(false);
  let working = $state(false);
  // Set when the server already holds a layout under this UUID; drives the
  // replace-or-keep prompt instead of a blind overwrite (#2608).
  let conflict = $state<ServerCopyInfo | null>(null);

  const layoutName = $derived(layoutStore.layout?.name ?? "your layout");
  const hasWork = $derived(layoutStore.hasRack);

  // Route any switch outcome: reload on success, raise the conflict prompt, or
  // toast the failure. Reload is synchronous so a debounced autosave never runs
  // before the navigation (matters most for the keep-server path).
  function handleResult(result: SwitchResult) {
    if (result.switched) {
      window.location.reload();
      return;
    }
    working = false;
    if (result.reason === "conflict") {
      conflict = result.serverCopy;
      return;
    }
    confirming = false;
    conflict = null;
    toastStore.showToast(result.message, "warning", 6000);
  }

  async function confirmSwitch() {
    working = true;
    handleResult(await switchToServerMode());
  }

  async function replaceServerCopy() {
    if (!conflict) return;
    working = true;
    handleResult(await confirmServerOverwrite(conflict));
  }

  async function keepServerCopy() {
    if (!conflict) return;
    working = true;
    handleResult(await adoptServerCopy(conflict));
  }

  function cancelConflict() {
    // The probe already restored the clean browser baseline (override never set,
    // apiAvailable dropped), so dismissing is purely local UI state.
    conflict = null;
    confirming = false;
    working = false;
  }

  function startSwitch() {
    if (hasWork) {
      confirming = true;
    } else {
      void confirmSwitch();
    }
  }

  function formatUpdatedAt(isoString: string): string {
    // toLocaleString already uses the locale's default hour cycle, so no explicit
    // hour12 is needed.
    return new Date(isoString).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatCounts(rackCount: number, deviceCount: number): string {
    const racks = rackCount === 1 ? "1 rack" : `${rackCount} racks`;
    const devices = deviceCount === 1 ? "1 device" : `${deviceCount} devices`;
    return `${racks}, ${devices}`;
  }
</script>

<div class="server-banner" role="alert">
  {#if conflict}
    <div class="server-banner-body">
      <p class="server-banner-title">A copy already exists on the server</p>
      <p class="server-banner-text">
        A layout with this ID is already saved on the server. Replace it with
        your browser copy, or keep the server copy and switch to server mode
        (find it in your Layouts list).
      </p>
      <p class="server-banner-text">
        Server copy "{conflict.name}": {formatCounts(
          conflict.rackCount,
          conflict.deviceCount,
        )}, updated {formatUpdatedAt(conflict.updatedAt)}.
      </p>
      <p class="server-banner-text">
        Your browser copy "{layoutName}": {formatCounts(
          layoutStore.rackCount,
          layoutStore.totalDeviceCount,
        )}.
      </p>
    </div>
    <div class="server-banner-actions">
      <button type="button" disabled={working} onclick={replaceServerCopy}>
        {working ? "Working..." : "Replace server copy"}
      </button>
      <button type="button" disabled={working} onclick={keepServerCopy}>
        {working ? "Working..." : "Keep server copy"}
      </button>
      <button
        type="button"
        class="server-banner-secondary"
        disabled={working}
        onclick={cancelConflict}
      >
        Cancel
      </button>
    </div>
  {:else if confirming}
    <div class="server-banner-body">
      <p class="server-banner-title">Upload and switch?</p>
      <p class="server-banner-text">
        Upload "{layoutName}" to the server and switch to server mode. Your
        browser copy stays until you remove it.
      </p>
    </div>
    <div class="server-banner-actions">
      <button type="button" disabled={working} onclick={confirmSwitch}>
        {working ? "Uploading..." : "Upload and switch"}
      </button>
      <button
        type="button"
        class="server-banner-secondary"
        disabled={working}
        onclick={() => (confirming = false)}
      >
        Cancel
      </button>
    </div>
  {:else}
    <div class="server-banner-body">
      <p class="server-banner-title">A storage server is available</p>
      <p class="server-banner-text">
        Your layouts are saving to this browser only. Switch to server mode to
        save them on the server.
      </p>
      <p class="server-banner-hint">
        To make server mode the default for everyone, set
        RACKULA_STORAGE_MODE=server.
      </p>
    </div>
    <div class="server-banner-actions">
      <button type="button" disabled={working} onclick={startSwitch}
        >Switch to server mode</button
      >
      <button
        type="button"
        class="server-banner-secondary"
        disabled={working}
        onclick={onDismiss}
      >
        Stay in browser mode
      </button>
    </div>
  {/if}
</div>

<style>
  .server-banner {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface-raised);
  }
  .server-banner-title {
    font-weight: 600;
    margin: 0;
  }
  .server-banner-text,
  .server-banner-hint {
    margin: 0;
    font-size: var(--font-size-sm);
  }
  .server-banner-hint {
    color: var(--colour-text-muted);
  }
  .server-banner-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
