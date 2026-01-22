<!--
  StartScreen - Layout selection and creation
  Shown on app launch when persistence is enabled
  Includes: New Layout, Import from File, Saved Layouts list
  Falls back gracefully if API unavailable
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    listSavedLayouts,
    loadSavedLayout,
    deleteSavedLayout,
    checkApiHealth,
    type SavedLayoutItem,
    PersistenceError,
  } from "$lib/utils/persistence-api";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { getImageStore } from "$lib/stores/images.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { openFilePicker } from "$lib/utils/file";
  import { extractFolderArchive } from "$lib/utils/archive";
  import {
    IconPlus,
    IconTrash,
    IconFolderBold,
    IconUpload,
    IconCloudOff,
  } from "$lib/components/icons";
  import LogoLockup from "$lib/components/LogoLockup.svelte";

  interface Props {
    onClose: (layoutId?: string) => void;
  }

  let { onClose }: Props = $props();

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const imageStore = getImageStore();

  let layouts = $state<SavedLayoutItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let apiAvailable = $state(true);
  let deletingId = $state<string | null>(null);

  onMount(async () => {
    // Check API health first
    apiAvailable = await checkApiHealth();

    if (apiAvailable) {
      await loadLayouts();
    } else {
      loading = false;
      error = null; // Not an error, just offline mode
    }
  });

  async function loadLayouts() {
    loading = true;
    error = null;

    try {
      layouts = await listSavedLayouts();
    } catch (e) {
      error =
        e instanceof PersistenceError ? e.message : "Failed to load layouts";
      console.error("Failed to load layouts:", e);
    } finally {
      loading = false;
    }
  }

  async function handleOpenLayout(item: SavedLayoutItem) {
    // Don't allow opening invalid layouts
    if (!item.valid) {
      toastStore.showToast(
        `"${item.name}" is corrupted and cannot be opened`,
        "error",
      );
      return;
    }

    try {
      const layout = await loadSavedLayout(item.id);
      layoutStore.loadLayout(layout);
      toastStore.showToast(`Opened "${item.name}"`, "info");
      onClose(item.id);
    } catch (e) {
      const message =
        e instanceof PersistenceError ? e.message : "Failed to open layout";
      toastStore.showToast(message, "error");
    }
  }

  async function handleDeleteLayout(item: SavedLayoutItem) {
    if (deletingId) return;

    deletingId = item.id;

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

  function handleNewLayout() {
    layoutStore.resetLayout();
    dialogStore.open("newRack");
    onClose();
  }

  async function handleImportFile() {
    const file = await openFilePicker();
    if (!file) return;

    try {
      const { layout, images, failedImages } = await extractFolderArchive(file);

      layoutStore.loadLayout(layout);

      // Load images into image store
      for (const [key, deviceImages] of images) {
        if (deviceImages.front) {
          imageStore.setDeviceImage(key, "front", deviceImages.front);
        }
        if (deviceImages.rear) {
          imageStore.setDeviceImage(key, "rear", deviceImages.rear);
        }
      }

      if (failedImages.length > 0) {
        toastStore.showToast(
          `Imported with ${failedImages.length} missing images`,
          "warning",
        );
      } else {
        toastStore.showToast(`Imported "${layout.name}"`, "info");
      }

      onClose();
    } catch (e) {
      toastStore.showToast("Failed to import file", "error");
      console.error("Import failed:", e);
    }
  }

  function handleContinueOffline() {
    onClose();
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatCounts(item: SavedLayoutItem): string {
    const racks = item.rackCount === 1 ? "1 rack" : `${item.rackCount} racks`;
    const devices =
      item.deviceCount === 1 ? "1 device" : `${item.deviceCount} devices`;
    return `${racks}, ${devices}`;
  }
</script>

<div class="start-screen">
  <div class="start-screen-content">
    <header class="start-header">
      <LogoLockup size={48} showcase={true} alwaysShowTitle={true} />
      <p class="subtitle">Rack Layout Designer for Homelabbers</p>
    </header>

    <div class="actions">
      <button class="action-btn primary" onclick={handleNewLayout}>
        <IconPlus size={20} />
        <span>New Layout</span>
      </button>
      <button class="action-btn secondary" onclick={handleImportFile}>
        <IconUpload />
        <span>Import File</span>
      </button>
    </div>

    {#if !apiAvailable}
      <div class="offline-warning">
        <IconCloudOff size={18} />
        <div class="offline-text">
          <strong>Persistence API unavailable</strong>
          <p>
            Working in offline mode. Changes will be saved to browser storage.
          </p>
        </div>
        <button class="continue-btn" onclick={handleContinueOffline}>
          Continue
        </button>
      </div>
    {:else}
      <section class="saved-layouts">
        <h2>
          <IconFolderBold size={18} />
          Saved Layouts
        </h2>

        {#if loading}
          <div class="loading">Loading...</div>
        {:else if error}
          <div class="error-message">{error}</div>
        {:else if layouts.length === 0}
          <div class="empty">
            <p>No saved layouts yet.</p>
            <p>Create a new layout or import an existing file!</p>
          </div>
        {:else}
          <div class="layout-list">
            {#each layouts as item (item.id)}
              <div
                class="layout-item"
                class:invalid={!item.valid}
                class:deleting={deletingId === item.id}
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
                <button
                  class="delete-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    handleDeleteLayout(item);
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteLayout(item);
                    }
                  }}
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
</div>

<style>
  .start-screen {
    position: fixed;
    inset: 0;
    background: var(--colour-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .start-screen-content {
    max-width: 520px;
    width: 100%;
    padding: var(--space-6);
  }

  .start-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: var(--space-8);
  }

  .subtitle {
    color: var(--colour-text-muted);
    margin-top: var(--space-2);
    text-align: center;
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s;
  }

  .action-btn.primary {
    background: var(--colour-button-primary);
    color: var(--colour-text-on-primary);
  }

  .action-btn.primary:hover {
    background: var(--colour-button-primary-hover);
  }

  .action-btn.secondary {
    background: var(--colour-surface);
    color: var(--colour-text);
    border: 1px solid var(--colour-border);
  }

  .action-btn.secondary:hover {
    background: var(--colour-surface-hover);
  }

  .offline-warning {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--colour-warning-bg);
    border: 1px solid var(--colour-warning);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-8);
    color: var(--colour-warning);
  }

  .offline-text p {
    margin: var(--space-2) 0 0;
    font-size: 0.875rem;
    color: var(--colour-text-muted);
  }

  .continue-btn {
    margin-left: auto;
    padding: var(--space-2) var(--space-4);
    background: var(--colour-warning);
    color: var(--colour-bg);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
    font-weight: 500;
  }

  .continue-btn:hover {
    filter: brightness(1.1);
  }

  .saved-layouts h2 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 1rem;
    color: var(--colour-text-muted);
    margin-bottom: var(--space-4);
  }

  .layout-list {
    display: flex;
    flex-direction: column;
    max-height: 320px;
    overflow-y: auto;
  }

  .layout-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-4);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
  }

  .layout-item:hover {
    border-color: var(--colour-primary);
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

  .layout-item.invalid:hover {
    border-color: var(--colour-error);
    cursor: not-allowed;
  }

  .error-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: var(--colour-error);
    color: white;
    font-size: 0.75rem;
    font-weight: bold;
    border-radius: var(--radius-full);
    margin-left: var(--space-2);
    vertical-align: middle;
  }

  .error-text {
    color: var(--colour-error);
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
    font-size: 0.8rem;
    color: var(--colour-text-muted);
  }

  .delete-btn {
    padding: var(--space-2);
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

  .loading,
  .error-message,
  .empty {
    text-align: center;
    padding: var(--space-8);
    color: var(--colour-text-muted);
  }

  .error-message {
    color: var(--colour-error);
  }
</style>
