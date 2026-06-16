<!--
  LayoutsLibrary Component

  Third sidebar tab (beside Devices and Racks). Lists the full library of saved
  layouts (#2325): open layouts (one per workspace tab) and closed-but-saved
  layouts (in the catalogue with no open tab). The toolbar tab strip (#2324)
  holds the open working set; this panel is where the user browses, reopens, and
  manages every layout.

  Activating a row opens-or-switches: an open layout's tab is focused, a closed
  layout's body is hydrated into a new tab. Closing a layout (the inline X on an
  open row) keeps it in the library, recoverable. Deleting (context menu, with
  confirmation) removes it from the library and closes its tab if open.

  Indicators are never colour-only (WCAG 1.4.1): each row pairs a state dot
  (filled for open, outline for closed) with a text label (Active / Open /
  Closed) and, for open rows, an aria-selected state. The list is keyboard
  navigable (Up/Down to move, Home/End to jump, Enter to open).
-->
<script lang="ts">
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import { generateId } from "$lib/utils/device";
  import type { Layout } from "$lib/types";
  import {
    buildLayoutRows,
    nextDuplicateName,
    type LayoutRow,
  } from "./layouts-library";
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
    buildLayoutRows(
      workspaceStore.tabs,
      workspaceStore.activeId,
      workspaceStore.library,
    ),
  );

  /** Stable per-row key: the tab id for an open row, the layout id for a closed one. */
  function rowKey(row: LayoutRow): string {
    return row.tabId ?? row.layoutId ?? "";
  }

  /**
   * Open or switch to the layout a row represents (#2325). An open row focuses
   * its tab; a closed row hydrates its persisted body into a new tab and
   * switches to it. Both route through the workspace store, which guarantees an
   * already-open layout never gets a duplicate tab.
   */
  function activateRow(row: LayoutRow) {
    if (row.layoutId) {
      workspaceStore.openFromLibrary(row.layoutId);
    } else if (row.tabId) {
      workspaceStore.switchTo(row.tabId);
    }
  }

  // Cached mini-render previews (#2083). The cache is bounded and session-only.
  // Keyed by the row key (open tab id or closed layout id) and invalidated by a
  // content hash, so a preview is re-rendered only when the layout's rendered
  // image would actually change, and a rename never throws the thumbnail away.
  // A closed layout's body is read once through the workspace store (no tab is
  // opened) and cached, so reopening does not re-read it from storage.
  const previewCache = createLayoutPreviewCache();

  /**
   * Resolve the preview SVG for a row, rendering and caching it on a miss.
   * Open rows render their live tab layout; closed rows read the persisted body
   * through the workspace store. Returns null when there is nothing to draw (no
   * body or no racks), so the row shows a placeholder instead of an empty frame.
   */
  function previewFor(row: LayoutRow): string | null {
    const key = rowKey(row);
    if (!key) return null;

    if (row.isOpen && row.tabId) {
      const layout = workspaceStore.tabs.find((t) => t.id === row.tabId)?.store
        .layout;
      if (!layout) return null;
      const contentKey = layoutPreviewKey(layout);
      const cached = previewCache.get(key, contentKey);
      if (cached !== undefined) return cached;
      const svg = renderLayoutPreviewSvg(layout);
      if (svg === null) return null;
      previewCache.set(key, contentKey, svg);
      return svg;
    }

    if (!row.layoutId) return null;
    // A closed layout's body is immutable while closed, so the layout id is a
    // stable content key: a cache hit serves without re-reading the body from
    // storage, and a miss reads it exactly once per session.
    const contentKey = `closed:${row.layoutId}`;
    const cached = previewCache.get(key, contentKey);
    if (cached !== undefined) return cached;
    const layout = workspaceStore.peekLibraryBody(row.layoutId);
    if (!layout) return null;
    const svg = renderLayoutPreviewSvg(layout);
    if (svg === null) return null;
    previewCache.set(key, contentKey, svg);
    return svg;
  }

  // Drop cache entries for rows that have left the list so the cache tracks the
  // visible set and does not grow unbounded across a long session.
  $effect(() => {
    const liveKeys = new Set(rows.map(rowKey));
    for (const id of previewCache.keys()) {
      if (!liveKeys.has(id)) previewCache.delete(id);
    }
  });

  // Confirmation state for deleting (removing from the library entirely).
  let deleteConfirmOpen = $state(false);
  let rowToDelete = $state<LayoutRow | null>(null);

  // Rename dialog state. Keyed by the row's stable key.
  let renameOpen = $state(false);
  let renameRowKey = $state<string | null>(null);
  let renameValue = $state("");

  // The listbox container. Each row is wrapped in a ContextMenu.Trigger, so a
  // row's parentElement is the trigger wrapper, not the listbox; querying the
  // rows off this bound element keeps arrow-key navigation working.
  let listEl = $state<HTMLElement | null>(null);

  function findRow(key: string): LayoutRow | undefined {
    return rows.find((r) => rowKey(r) === key);
  }

  function handleRowKeydown(event: KeyboardEvent, row: LayoutRow) {
    // Only act on keys aimed at the row itself. The row contains a focusable
    // close button; without this guard, Enter/Space on that button would bubble
    // here, fire activateRow, and preventDefault would swallow the button's own
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
        activateRow(row);
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
        initiateDelete(row);
        break;
    }
  }

  // Close an open layout: it leaves the open set but stays in the library,
  // recoverable. Distinct from delete, which removes it everywhere.
  function closeLayout(row: LayoutRow) {
    if (!row.tabId) return;
    workspaceStore.closeTab(row.tabId);
    toastStore.showToast(`Closed "${row.name}"`, "info");
  }

  function initiateDelete(row: LayoutRow) {
    rowToDelete = row;
    deleteConfirmOpen = true;
  }

  function confirmDelete() {
    const row = rowToDelete;
    if (row) {
      // Delete removes the layout from the library and closes its tab if open.
      // A closed row deletes by layout id; an open in-session row that never
      // reached the persisted library (no layout id) just closes its tab.
      if (row.layoutId) {
        workspaceStore.deleteLayout(row.layoutId);
      } else if (row.tabId) {
        workspaceStore.closeTab(row.tabId);
      }
      toastStore.showToast(`Deleted "${row.name}"`, "info");
    }
    deleteConfirmOpen = false;
    rowToDelete = null;
  }

  function cancelDelete() {
    deleteConfirmOpen = false;
    rowToDelete = null;
  }

  // The source layout for an action that needs the full body: an open row reads
  // its live tab; a closed row reads its persisted body through the store (no
  // tab opened). Returns null when a closed body is unreadable.
  function sourceLayoutFor(row: LayoutRow): Layout | null {
    if (row.isOpen && row.tabId) {
      return (
        workspaceStore.tabs.find((t) => t.id === row.tabId)?.store.layout ??
        null
      );
    }
    if (row.layoutId) return workspaceStore.peekLibraryBody(row.layoutId);
    return null;
  }

  // Names already taken across the whole library (open tabs and closed rows),
  // so a duplicate of a closed layout still avoids colliding with a closed one.
  function libraryNames(): string[] {
    return rows.map((r) => r.name);
  }

  function duplicateLayout(row: LayoutRow) {
    const source = sourceLayoutFor(row);
    if (!source) {
      toastStore.showToast(`Cannot duplicate "${row.name}"`, "error");
      return;
    }
    const name = nextDuplicateName(libraryNames(), source.name);
    const clone: Layout = structuredClone($state.snapshot(source));
    clone.name = name;
    clone.metadata = { ...clone.metadata, id: generateId(), name };
    workspaceStore.openTab(clone);
    toastStore.showToast(`Duplicated as "${name}"`, "info");
  }

  function openRename(row: LayoutRow) {
    renameRowKey = rowKey(row);
    renameValue = row.name;
    renameOpen = true;
  }

  function confirmRename() {
    const key = renameRowKey;
    const trimmed = renameValue.trim();
    if (key && trimmed) {
      const row = findRow(key);
      if (row) {
        // Open the layout (focuses an open tab, or hydrates a closed one) so the
        // rename runs against the live store and persists like any edit.
        activateRow(row);
        const active = workspaceStore.tabs.find(
          (t) => t.id === workspaceStore.activeId,
        );
        active?.store.setLayoutName(trimmed);
      }
    }
    closeRename();
  }

  function closeRename() {
    renameOpen = false;
    renameRowKey = null;
    renameValue = "";
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmRename();
    }
  }

  // Export a row's layout. Open rows export directly; a closed row is opened
  // first so the existing tab-based export path has a live tab to work from.
  function exportLayout(row: LayoutRow) {
    if (!onexport) return;
    activateRow(row);
    const activeTabId = workspaceStore.activeId;
    onexport(activeTabId);
  }

  function getDeleteMessage(): string {
    if (!rowToDelete) return "";
    return `Delete "${rowToDelete.name}"? This removes it from your library and cannot be undone.`;
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
    {#each rows as row (rowKey(row))}
      {@const previewSvg = previewFor(row)}
      <LayoutContextMenu
        onopen={() => activateRow(row)}
        onrename={() => openRename(row)}
        onduplicate={() => duplicateLayout(row)}
        onexport={onexport ? () => exportLayout(row) : undefined}
        ondelete={() => initiateDelete(row)}
      >
        <div
          class="layout-item"
          class:active={row.isActive}
          class:closed={!row.isOpen}
          onclick={() => activateRow(row)}
          onkeydown={(e) => handleRowKeydown(e, row)}
          role="option"
          aria-selected={row.isActive}
          tabindex={row.isActive ? 0 : -1}
          data-testid="layout-item-{rowKey(row)}"
        >
          <span
            class="layout-indicator"
            class:is-active={row.isActive}
            class:is-open={row.isOpen}
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
              <span class="layout-state">
                {#if row.isActive}
                  Active
                {:else if row.isOpen}
                  Open
                {:else}
                  Closed
                {/if}
              </span>
              {#if row.isOpen}
                <span aria-hidden="true">·</span>
                {row.rackCount} rack{row.rackCount !== 1 ? "s" : ""} ·
                {row.deviceCount} device{row.deviceCount !== 1 ? "s" : ""}
              {/if}
            </span>
          </span>
          {#if row.isOpen}
            <button
              type="button"
              class="layout-delete"
              onclick={(e) => {
                e.stopPropagation();
                closeLayout(row);
              }}
              aria-label="Close {row.name}"
              title="Close layout"
            >
              ✕
            </button>
          {/if}
        </div>
      </LayoutContextMenu>
    {/each}

    {#if rows.length === 0}
      <div class="empty-state">
        <p class="empty-message">No saved layouts</p>
        <p class="empty-hint">Create a layout to get started</p>
      </div>
    {/if}
  </div>
</div>

<ConfirmDialog
  open={deleteConfirmOpen}
  title="Delete Layout"
  message={getDeleteMessage()}
  confirmLabel="Delete"
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

  /* State dot. Shape carries the open/closed distinction independent of colour
     (WCAG 1.4.1): a closed layout is a hollow outline ring, an open one is a
     filled dot, and the active one is filled in the success colour. The text
     state label (Active / Open / Closed) is the primary, fully colour-free cue;
     the dot reinforces it. */
  .layout-indicator {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--colour-border);
    background: transparent;
  }

  .layout-indicator.is-open {
    background: var(--colour-text-muted);
    border-color: var(--colour-text-muted);
  }

  .layout-indicator.is-active {
    background: var(--colour-success);
    border-color: var(--colour-success);
  }

  /* A closed layout reads as available-but-inactive: the name stays legible, the
     row is slightly recessed so the open working set stands out. */
  .layout-item.closed .layout-name {
    color: var(--colour-text-muted);
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
