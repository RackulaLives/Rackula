<!--
  LayoutsLibrary Component

  Third sidebar tab (beside Devices and Racks). Lists the layouts the user is
  working with as a compact row list and keeps it in sync with the open tabs.

  Source of truth for this slice is the workspace store's OPEN set (#2079): one
  row per open layout. The durable browser-mode library of every saved layout
  depends on the multi-layout storage schema (#2179/#2080), which is a separate
  slice; cached mini-render previews are #2083. Neither is built here, and the
  row markup leaves room for a leading preview without restructuring.

  Indicators are never colour-only (WCAG 1.4.1): the active/open dot is paired
  with a text label and an aria-selected state. The list is fully keyboard
  navigable (Up/Down to move, Home/End to jump, Enter to open, Delete to remove
  with confirmation).
-->
<script lang="ts">
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { generateId } from "$lib/utils/device";
  import type { Layout } from "$lib/types";
  import { buildLayoutRows, nextDuplicateName } from "./layouts-library";
  import {
    layoutPreviewKey,
    createLayoutPreviewCache,
  } from "./layout-preview-cache";
  import { renderLayoutPreviewSvg } from "./layout-preview-render";
  import LayoutContextMenu from "./LayoutContextMenu.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import Dialog from "./Dialog.svelte";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    /** Create a new, empty layout in a new tab. */
    onnewlayout?: () => void;
    /** Export the layout backing the given tab. */
    onexport?: (tabId: string) => void;
  }

  let { onnewlayout, onexport }: Props = $props();

  const workspaceStore = getWorkspaceStore();
  const toastStore = getToastStore();

  const rows = $derived(
    buildLayoutRows(workspaceStore.tabs, workspaceStore.activeId),
  );

  // Cached mini-render previews (#2083). The cache is bounded and session-only:
  // durable persistence of previews belongs to the storage slice (#2080). Keyed
  // by tab id and invalidated by a content hash, so a preview is re-rendered
  // only when the layout's rendered image would actually change (placing or
  // moving a device, resizing a rack, recolouring a device type), and a rename
  // never throws the thumbnail away.
  const previewCache = createLayoutPreviewCache();

  /**
   * Resolve the preview SVG for a tab, rendering and caching it on a miss.
   * Returns null when there is nothing to draw (no racks), so the row shows a
   * placeholder instead of an empty frame.
   */
  function previewFor(tabId: string): string | null {
    const tab = workspaceStore.tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    const layout = tab.store.layout;
    const key = layoutPreviewKey(layout);
    const cached = previewCache.get(tabId, key);
    if (cached !== undefined) return cached;

    const svg = renderLayoutPreviewSvg(layout);
    if (svg === null) return null;
    previewCache.set(tabId, key, svg);
    return svg;
  }

  // Drop cache entries for tabs that have closed so the cache tracks the open
  // set and does not grow unbounded across a long session.
  $effect(() => {
    const openIds = new Set(workspaceStore.tabs.map((t) => t.id));
    for (const id of previewCache.keys()) {
      if (!openIds.has(id)) previewCache.delete(id);
    }
  });

  // Delete confirmation state.
  let deleteConfirmOpen = $state(false);
  let layoutToDelete = $state<{ tabId: string; name: string } | null>(null);

  // Rename dialog state.
  let renameOpen = $state(false);
  let renameTabId = $state<string | null>(null);
  let renameValue = $state("");

  // The listbox container. Each row is wrapped in a ContextMenu.Trigger, so a
  // row's parentElement is the trigger wrapper, not the listbox; querying the
  // rows off this bound element keeps arrow-key navigation working.
  let listEl = $state<HTMLElement | null>(null);

  function openLayout(tabId: string) {
    workspaceStore.switchTo(tabId);
  }

  function handleRowKeydown(event: KeyboardEvent, tabId: string) {
    // Only act on keys aimed at the row itself. The row contains a focusable
    // close button; without this guard, Enter/Space on that button would bubble
    // here, fire openLayout, and preventDefault would swallow the button's own
    // activation.
    if (event.target !== event.currentTarget) return;

    const items = listEl
      ? Array.from(listEl.querySelectorAll<HTMLElement>("[role='option']"))
      : [];
    const index = items.findIndex((el) => el === event.currentTarget);

    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        openLayout(tabId);
        break;
      case "ArrowDown":
        event.preventDefault();
        items[Math.min(index + 1, items.length - 1)]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        items[Math.max(index - 1, 0)]?.focus();
        break;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        initiateDelete(tabId);
        break;
    }
  }

  function initiateDelete(tabId: string) {
    const row = rows.find((r) => r.tabId === tabId);
    if (!row) return;
    layoutToDelete = { tabId, name: row.name };
    deleteConfirmOpen = true;
  }

  function confirmDelete() {
    if (layoutToDelete) {
      workspaceStore.closeTab(layoutToDelete.tabId);
      toastStore.showToast(`Closed "${layoutToDelete.name}"`, "info");
    }
    deleteConfirmOpen = false;
    layoutToDelete = null;
  }

  function cancelDelete() {
    deleteConfirmOpen = false;
    layoutToDelete = null;
  }

  function duplicateLayout(tabId: string) {
    const tab = workspaceStore.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const source = tab.store.layout;
    const existingNames = workspaceStore.tabs.map((t) => t.store.layout.name);
    const name = nextDuplicateName(existingNames, source.name);
    const clone: Layout = structuredClone($state.snapshot(source));
    clone.name = name;
    clone.metadata = { ...clone.metadata, id: generateId(), name };
    workspaceStore.openTab(clone);
    toastStore.showToast(`Duplicated as "${name}"`, "info");
  }

  function openRename(tabId: string) {
    const row = rows.find((r) => r.tabId === tabId);
    if (!row) return;
    renameTabId = tabId;
    renameValue = row.name;
    renameOpen = true;
  }

  function confirmRename() {
    const tabId = renameTabId;
    const trimmed = renameValue.trim();
    if (tabId && trimmed) {
      const tab = workspaceStore.tabs.find((t) => t.id === tabId);
      tab?.store.setLayoutName(trimmed);
    }
    closeRename();
  }

  function closeRename() {
    renameOpen = false;
    renameTabId = null;
    renameValue = "";
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmRename();
    }
  }

  function getDeleteMessage(): string {
    if (!layoutToDelete) return "";
    return `Close "${layoutToDelete.name}"? It will be removed from the open layouts.`;
  }
</script>

<div class="layouts-library">
  <div class="library-header">
    <span class="layout-count">
      {rows.length} Layout{rows.length !== 1 ? "s" : ""}
    </span>
    {#if onnewlayout}
      <Tooltip text="New Layout" position="bottom">
        <button
          type="button"
          class="new-layout-btn"
          onclick={onnewlayout}
          aria-label="New Layout"
          data-testid="btn-new-layout"
        >
          +
        </button>
      </Tooltip>
    {/if}
  </div>

  <div
    bind:this={listEl}
    class="layout-items"
    role="listbox"
    aria-label="Layout library"
  >
    {#each rows as row (row.tabId)}
      {@const previewSvg = previewFor(row.tabId)}
      <LayoutContextMenu
        onopen={() => openLayout(row.tabId)}
        onrename={() => openRename(row.tabId)}
        onduplicate={() => duplicateLayout(row.tabId)}
        onexport={onexport ? () => onexport(row.tabId) : undefined}
        ondelete={() => initiateDelete(row.tabId)}
      >
        <div
          class="layout-item"
          class:active={row.isActive}
          onclick={() => openLayout(row.tabId)}
          onkeydown={(e) => handleRowKeydown(e, row.tabId)}
          role="option"
          aria-selected={row.isActive}
          tabindex={row.isActive ? 0 : -1}
          data-testid="layout-item-{row.tabId}"
        >
          <span
            class="layout-indicator"
            class:is-active={row.isActive}
            aria-hidden="true"
          ></span>
          <span class="layout-preview" aria-hidden="true">
            {#if previewSvg}
              <!-- eslint-disable-next-line svelte/no-at-html-tags -- Safe: SVG built by generateExportSVG via the DOM API; all user text is set with textContent and escaped by XMLSerializer, never raw-HTML injected. -->
              {@html previewSvg}
            {:else}
              <span class="layout-preview-empty"></span>
            {/if}
          </span>
          <span class="layout-info">
            <span class="layout-name">{row.name}</span>
            <span class="layout-meta">
              <span class="layout-state"
                >{row.isActive ? "Active" : "Open"}</span
              >
              <span aria-hidden="true">·</span>
              {row.rackCount} rack{row.rackCount !== 1 ? "s" : ""} ·
              {row.deviceCount} device{row.deviceCount !== 1 ? "s" : ""}
            </span>
          </span>
          <button
            type="button"
            class="layout-delete"
            onclick={(e) => {
              e.stopPropagation();
              initiateDelete(row.tabId);
            }}
            aria-label="Close {row.name}"
            title="Close layout"
          >
            ✕
          </button>
        </div>
      </LayoutContextMenu>
    {/each}

    {#if rows.length === 0}
      <div class="empty-state">
        <p class="empty-message">No layouts open</p>
        <p class="empty-hint">Create a layout to get started</p>
      </div>
    {/if}
  </div>
</div>

<ConfirmDialog
  open={deleteConfirmOpen}
  title="Close Layout"
  message={getDeleteMessage()}
  confirmLabel="Close"
  onconfirm={confirmDelete}
  oncancel={cancelDelete}
/>

<Dialog open={renameOpen} title="Rename Layout" size="S" onclose={closeRename}>
  <div class="rename-dialog">
    <label class="rename-label" for="layout-rename-input">Layout name</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="layout-rename-input"
      class="rename-input"
      type="text"
      bind:value={renameValue}
      onkeydown={handleRenameKeydown}
      autofocus
      data-testid="layout-rename-input"
    />
    <div class="rename-actions">
      <button type="button" class="btn btn-secondary" onclick={closeRename}>
        Cancel
      </button>
      <button
        type="button"
        class="btn btn-primary"
        onclick={confirmRename}
        data-testid="btn-confirm-rename"
      >
        Rename
      </button>
    </div>
  </div>
</Dialog>

<style>
  .layouts-library {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--colour-border);
  }

  .layout-count {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .new-layout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-8);
    height: var(--space-8);
    padding: 0;
    font-size: var(--font-size-lg);
    font-weight: 400;
    line-height: 1;
    color: var(--colour-text-muted);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .new-layout-btn:hover {
    color: var(--colour-text);
    background: var(--colour-surface-hover);
    border-color: var(--colour-border-hover);
  }

  .new-layout-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .new-layout-btn:active {
    background: var(--colour-surface-active);
  }

  .layout-items {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .layout-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .layout-item:hover {
    background: var(--colour-surface-hover);
  }

  .layout-item.active {
    background: var(--colour-surface-active);
    border-color: var(--colour-selection);
  }

  .layout-item:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .layout-indicator {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--colour-border);
    background: transparent;
  }

  .layout-indicator.is-active {
    background: var(--colour-success, #2e7d32);
    border-color: var(--colour-success, #2e7d32);
  }

  /* Cached mini-render of the layout (#2083). Decorative (aria-hidden): the row
     name and meta carry the accessible label, so the thumbnail is never the only
     affordance. A fixed box keeps row height stable while the inner SVG scales to
     fit without distortion. */
  .layout-preview {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: var(--space-1, 4px);
    overflow: hidden;
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }

  .layout-preview :global(svg) {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
  }

  .layout-preview-empty {
    width: 100%;
    height: 100%;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      var(--colour-border) 4px,
      var(--colour-border) 5px
    );
    opacity: 0.4;
  }

  .layout-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5, 2px);
    min-width: 0;
  }

  .layout-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .layout-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .layout-state {
    font-weight: var(--font-weight-medium);
  }

  .layout-item.active .layout-state {
    color: var(--colour-success, #2e7d32);
  }

  .layout-delete {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .layout-item:hover .layout-delete,
  .layout-item:focus-within .layout-delete {
    opacity: 1;
  }

  .layout-delete:hover {
    background: var(--colour-error);
    color: var(--colour-text-on-error, #fff);
  }

  .layout-delete:focus-visible {
    opacity: 1;
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  /* Touch devices cannot hover: keep the close control visible. */
  @media (hover: none) {
    .layout-delete {
      opacity: 1;
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    text-align: center;
  }

  .empty-message {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .empty-hint {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .rename-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .rename-label {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }

  .rename-input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-base);
    color: var(--colour-text);
    background: var(--colour-input-bg, var(--colour-surface-secondary));
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }

  .rename-input:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 1px;
  }

  .rename-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .btn {
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-secondary {
    background: var(--colour-button-bg);
    color: var(--colour-text);
  }

  .btn-secondary:hover {
    background: var(--colour-button-hover);
  }

  .btn-primary {
    background: var(--colour-selection);
    color: white;
  }

  .btn-primary:hover {
    background: var(--colour-selection-hover);
  }

  .btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }
</style>
