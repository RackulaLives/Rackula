<!--
  MobileLayoutsSheet Component

  Body of the mobile Layouts bottom sheet (#2460). Lists every layout the user
  has, marks the current one, switches the active layout on tap, and offers a
  New layout action. It reads the shared workspace store directly and routes
  switching through the same verbs the desktop LayoutsLibrary uses
  (openFromLibrary / switchTo), so mobile does not fork the layout-switching
  logic. Creating a new layout opens a fresh tab and lets the parent raise the
  New Rack wizard via onnewlayout.

  Indicators are never colour-only (WCAG 1.4.1): each row pairs a state dot with
  a text label (Active / Open / Closed), and the active row carries
  aria-selected.
-->
<script lang="ts">
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { createLayout } from "$lib/utils/serialization";
  import { buildLayoutRows, type LayoutRow } from "../layouts-library";
  import { IconPlusBold } from "$lib/components/icons";
  import { ICON_SIZE } from "$lib/constants/sizing";

  interface Props {
    /** Raise the New Rack wizard after a fresh layout is opened. */
    onnewlayout?: () => void;
    /** Dismiss the sheet (after a switch or a create). */
    onclose?: () => void;
  }

  let { onnewlayout, onclose }: Props = $props();

  const workspaceStore = getWorkspaceStore();

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

  // Switch to the layout a row represents, then dismiss the sheet. An open row
  // focuses its tab; a closed row hydrates its persisted body into a new tab.
  // Both route through the workspace store, which never opens a duplicate tab.
  function activateRow(row: LayoutRow) {
    if (row.layoutId) {
      workspaceStore.openFromLibrary(row.layoutId);
    } else if (row.tabId) {
      workspaceStore.switchTo(row.tabId);
    }
    onclose?.();
  }

  // Open a fresh empty layout in its own tab, make it active, then let the
  // parent raise the New Rack wizard and dismiss the sheet. Mirrors the desktop
  // New layout flow (App.handleNewLayout) so the two stay aligned.
  function handleNewLayout() {
    workspaceStore.openTab(createLayout());
    onnewlayout?.();
    onclose?.();
  }
</script>

<div class="mobile-layouts-sheet">
  <button
    type="button"
    class="new-layout"
    onclick={handleNewLayout}
    data-testid="mobile-new-layout"
  >
    <IconPlusBold size={ICON_SIZE.sm} />
    New layout
  </button>

  <div class="layout-list" role="listbox" aria-label="Layouts">
    {#each rows as row (rowKey(row))}
      <button
        type="button"
        class="layout-row"
        class:active={row.isActive}
        role="option"
        aria-selected={row.isActive}
        onclick={() => activateRow(row)}
        data-testid="mobile-layout-row-{rowKey(row)}"
      >
        <span
          class="row-indicator"
          class:is-active={row.isActive}
          class:is-open={row.isOpen}
          aria-hidden="true"
        ></span>
        <span class="row-info">
          <span class="row-name">{row.name}</span>
          <span class="row-meta">
            <span class="row-state">
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
      </button>
    {/each}
  </div>
</div>

<style>
  .mobile-layouts-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-1) var(--space-4);
  }

  .new-layout {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    background: var(--colour-surface);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .new-layout:hover {
    background: var(--colour-surface-hover);
    border-color: var(--colour-text-muted);
  }

  .new-layout:active {
    background: var(--colour-surface-hover);
    scale: 0.98;
  }

  .new-layout:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .layout-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .layout-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--touch-target-min);
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--colour-text);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .layout-row:hover {
    background: var(--colour-surface-hover);
  }

  .layout-row:active {
    scale: 0.99;
  }

  .layout-row.active {
    background: var(--colour-surface-active);
    border-color: var(--colour-selection);
  }

  .layout-row:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  /* State dot. Shape carries the open/closed distinction independent of colour
     (WCAG 1.4.1): a closed layout is a hollow ring, an open one is a filled
     dot, and the active one is filled in the success colour. The text state
     label is the primary, fully colour-free cue; the dot reinforces it. */
  .row-indicator {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--colour-border);
    background: transparent;
  }

  .row-indicator.is-open {
    background: var(--colour-text-muted);
    border-color: var(--colour-text-muted);
  }

  .row-indicator.is-active {
    background: var(--colour-success);
    border-color: var(--colour-success);
  }

  .row-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
  }

  .row-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-meta {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
  }

  .row-state {
    font-weight: var(--font-weight-medium);
  }

  .layout-row.active .row-state {
    color: var(--colour-success);
  }
</style>
