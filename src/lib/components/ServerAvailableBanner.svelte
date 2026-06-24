<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { switchToServerMode } from "$lib/storage";

  // Shown only when the parent determines a server is reachable in browser mode.
  let { onDismiss }: { onDismiss: () => void } = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();

  let confirming = $state(false);
  let working = $state(false);

  const layoutName = $derived(layoutStore.layout?.name ?? "your layout");
  const hasWork = $derived(layoutStore.hasRack);

  async function confirmSwitch() {
    working = true;
    const result = await switchToServerMode();
    if (result.switched) {
      // Boot cleanly in server mode; the override now resolves getStorageMode.
      window.location.reload();
      return;
    }
    working = false;
    confirming = false;
    toastStore.showToast(result.message, "warning", 6000);
  }

  function startSwitch() {
    if (hasWork) {
      confirming = true;
    } else {
      void confirmSwitch();
    }
  }
</script>

<div class="server-banner" role="alert">
  {#if !confirming}
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
      <button type="button" class="server-banner-secondary" onclick={onDismiss}>
        Stay in browser mode
      </button>
    </div>
  {:else}
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
    gap: var(--space-2);
  }
</style>
