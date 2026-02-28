<!--
  LoadDialog - Unified Load Interface
  Allows choosing between persisted (API) layouts and local file import
-->
<script lang="ts">
  import {
    listSavedLayouts,
    deleteSavedLayout,
    type SavedLayoutItem,
    PersistenceError,
  } from "$lib/utils/persistence-api";
  import { isApiAvailable } from "$lib/stores/persistence.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { loadFromApi, loadFromFile } from "$lib/utils/load-pipeline";
  import { persistenceDebug } from "$lib/utils/debug";
  import {
    IconTrash,
    IconFolderBold,
    IconUpload,
  } from "$lib/components/icons";
  import Dialog from "./Dialog.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";

  const toastStore = getToastStore();

  let layouts = $state<SavedLayoutItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let confirmingDeleteId = $state<string | null>(null);
  let apiActive = $derived(isApiAvailable());

  const confirmingDeleteItem = $derived(
    layouts.find((l) => l.id === confirmingDeleteId),
  );

  $effect(() => {
    if (!dialogStore.isOpen("load")) return;
    if (!apiActive) {
      loading = false;
      return;
    }
    void loadLayouts();
  });

  async function loadLayouts() {
    loading = true;
    error = null;

    try {
      layouts = await listSavedLayouts();
    } catch (e) {
      error =
        e instanceof PersistenceError ? e.message : "Failed to load layouts";
      persistenceDebug.api("loadLayouts: failed %O", e);
    } finally {
      loading = false;
    }
  }

  async function handleOpenLayout(item: SavedLayoutItem) {
    if (!item.valid) {
      toastStore.showToast(
        `"${item.name}" is corrupted and cannot be opened`,
        "error",
      );
      return;
    }

    const success = await loadFromApi(item.id);
    if (success) {
      dialogStore.close();
    }
  }

  function handleDeleteLayout(item: SavedLayoutItem) {
    if (deletingId) return;
    confirmingDeleteId = item.id;
  }

  async function confirmDelete() {
    if (!confirmingDeleteItem) return;

    const item = confirmingDeleteItem;
    deletingId = item.id;
    confirmingDeleteId = null;

    try {
      await deleteSavedLayout(item.id);
      layouts = layouts.filter((l) => l.id !== item.id);
      toastStore.showToast(`Deleted "${item.name}"`, "info");
    } catch (e) {
      const message =
        e instanceof PersistenceError ? e.message : "Failed to delete layout";
      toastStore.showToast(message, "error");
    } finally {
      deletingId = null;
    }
  }

  async function handleImportFile() {
    const success = await loadFromFile();
    if (success) {
      dialogStore.close();
    }
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    const hour12 = new Intl.DateTimeFormat().resolvedOptions().hour12;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    });
  }

  function formatCounts(item: SavedLayoutItem): string {
    const racks = item.rackCount === 1 ? "1 rack" : `${item.rackCount} racks`;
    const devices =
      item.deviceCount === 1 ? "1 device" : `${item.deviceCount} devices`;
    return `${racks}, ${devices}`;
  }
</script>

<Dialog
  open={dialogStore.isOpen("load")}
  title="Load Layout"
  width="min(520px, 95vw)"
  onclose={() => dialogStore.close()}
>
  <div class="load-dialog-content">
    <div class="actions">
      <button class="import-file-btn" onclick={handleImportFile}>
        <IconUpload size={18} />
        <span>Import from local file (.zip)</span>
      </button>
    </div>

    {#if apiActive}
      <section class="saved-layouts">
        <h3>
          <IconFolderBold size={16} />
          Saved on Server
        </h3>

        {#if loading}
          <div class="status-box">
            <div class="spinner-loader" data-testid="spinner-loader"></div>
            <span>Loading saved layouts...</span>
          </div>
        {:else if error}
          <div class="status-box error">
            <span>{error}</span>
            <button class="retry-link" onclick={loadLayouts}>Retry</button>
          </div>
        {:else if !layouts || layouts.length === 0}
          <div class="status-box empty">
            <p>No layouts saved on server yet.</p>
          </div>
        {:else}
          <div class="layout-list">
            {#each layouts as item (item.id)}
              <div
                class="layout-item"
                class:invalid={!item.valid}
                class:deleting={deletingId === item.id}
              >
                <div
                  class="layout-row"
                  role="button"
                  tabindex={item.valid ? 0 : -1}
                  aria-disabled={!item.valid}
                  onclick={() => handleOpenLayout(item)}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenLayout(item);
                    }
                  }}
                >
                  <div class="layout-info">
                    <span class="layout-name">
                      {item.name}
                      {#if !item.valid}
                        <span class="error-badge" title="Corrupted file">!</span>
                      {/if}
                    </span>
                    <span class="layout-meta">
                      {#if item.valid}
                        {formatCounts(item)} - {formatDate(item.updatedAt)}
                      {:else}
                        <span class="error-text">File corrupted</span> -
                        {formatDate(item.updatedAt)}
                      {/if}
                    </span>
                  </div>
                </div>
                <button
                  class="delete-btn"
                  onclick={() => handleDeleteLayout(item)}
                  disabled={deletingId === item.id}
                  aria-label={`Delete layout ${item.name}`}
                  title="Delete layout"
                >
                  <IconTrash size={16} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</Dialog>

<ConfirmDialog
  open={!!confirmingDeleteId}
  title="Delete Layout?"
  message={confirmingDeleteItem
    ? `Are you sure you want to delete "${confirmingDeleteItem.name}"? This cannot be undone.`
    : ""}
  onconfirm={confirmDelete}
  oncancel={() => (confirmingDeleteId = null)}
/>

<style>
  .load-dialog-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-1);
  }

  .import-file-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-4);
    background: var(--colour-surface);
    border: 2px dashed var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .import-file-btn:hover {
    border-color: var(--colour-primary);
    background: var(--colour-surface-hover);
  }

  .saved-layouts h3 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--colour-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-4);
  }

  .status-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    color: var(--colour-text-muted);
    text-align: center;
  }

  .spinner-loader {
    width: var(--icon-size-lg);
    height: var(--icon-size-lg);
    border: 2px solid var(--colour-border);
    border-radius: var(--radius-full);
    border-top-color: var(--colour-primary);
    animation: spin 1s linear infinite;
  }

  .status-box.error {
    color: var(--colour-error);
    background: var(--colour-error-bg);
    border-color: var(--colour-error);
  }

  .retry-link {
    background: none;
    border: none;
    color: var(--colour-primary);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .layout-list {
    display: flex;
    flex-direction: column;
    max-height: 320px;
    overflow-y: auto;
    padding-right: var(--space-1);
  }

  .layout-item {
    display: flex;
    align-items: center;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
    transition:
      border-color 0.15s,
      background-color 0.15s;
  }

  .layout-item:hover {
    border-color: var(--colour-primary);
    background: var(--colour-surface-hover);
  }

  .layout-row {
    flex: 1;
    min-width: 0;
    padding: var(--space-4);
    cursor: pointer;
  }

  .layout-item.deleting {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .layout-item.invalid {
    border-color: var(--colour-error);
    background: var(--colour-error-bg);
  }

  .layout-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .layout-name {
    font-weight: 500;
    color: var(--colour-text);
  }

  .layout-meta {
    font-size: 0.75rem;
    color: var(--colour-text-muted);
  }

  .error-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: var(--colour-error);
    color: white;
    font-size: 0.625rem;
    font-weight: bold;
    border-radius: 50%;
    margin-left: var(--space-2);
  }

  .error-text {
    color: var(--colour-error);
  }

  .delete-btn {
    padding: var(--space-2);
    margin-right: var(--space-2);
    border: none;
    background: transparent;
    color: var(--colour-text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
      color 0.15s,
      background-color 0.15s;
  }

  .delete-btn:hover {
    color: var(--colour-error);
    background: var(--colour-error-bg);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
