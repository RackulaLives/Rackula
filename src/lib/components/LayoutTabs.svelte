<!--
  LayoutTabs Component
  The layout tab strip, folded into the toolbar's centre lane (#2324). Each tab
  switches the active layout. A single open layout renders as one tab (the
  active tab carries the layout name; there is no separate name field). The
  strip carries a persistent new-layout "+" and, when the tabs do not all fit,
  an overflow chevron with a hidden-count badge.

  Behaviour:
  - The active tab is always pinned visible; overflow tabs collapse behind the
    chevron (partitionTabs is the pure split, fed a measured lane width).
  - "+" opens a fresh layout in a new tab (workspace.openTab()).
  - Double-click the active tab to rename it inline; the input is focused and
    its text selected. Right-click any tab opens the shared LayoutContextMenu
    (Rename / Duplicate / Export / Delete).
  - Drag a tab to reorder. Per-tab close removes a layout from the open set
    (the layout is not deleted); the close control is hidden on the sole tab so
    the canvas always has an active layout.

  Accessibility:
  - role="tablist" / role="tab" with aria-selected on the active tab.
  - Roving tabindex: only the active tab is in the tab order; ArrowLeft/Right
    move focus between visible tabs (Home/End jump to first/last).
  - The unbacked-changes dot carries accessible text (never colour alone,
    WCAG 1.4.1); the close control has an accessible name.
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { getLayoutDurability } from "$lib/storage";
  import type { Layout } from "$lib/types";
  import { generateId } from "$lib/utils/device";
  import { IconClose, IconPlus, IconChevronDown } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import { partitionTabs, tabHasClose } from "./layout-tabs";
  import { nextDuplicateName } from "./layouts-library";
  import LayoutContextMenu from "./LayoutContextMenu.svelte";
  import "$lib/styles/menu.css";
  import "$lib/styles/tabs.css";

  interface Props {
    /** Export the layout backing the given tab (app-menu export path). */
    onexport?: (tabId: string) => void;
  }

  let { onexport }: Props = $props();

  const workspace = getWorkspaceStore();

  // One tab occupies roughly this width including its gap. Used only to estimate
  // how many tabs fit; the active tab is always pinned regardless.
  const TAB_WIDTH_PX = 168;

  // The label and durability dot read live from each tab's own store.
  const tabViews = $derived(
    workspace.tabs.map((tab) => {
      const durability = getLayoutDurability(tab.store);
      return {
        id: tab.id,
        get name() {
          return tab.store.layout.name;
        },
        // "Backed" means durable (saved/exported with no changes since). An
        // unbacked tab shows the changes dot.
        get unbacked() {
          return durability.status !== "saved";
        },
        get statusLabel() {
          return durability.label;
        },
      };
    }),
  );

  // Available width of the strip, measured by a ResizeObserver. Starts wide so
  // the first paint (before measurement) shows every tab rather than collapsing.
  let laneWidth = $state(Number.POSITIVE_INFINITY);
  let stripEl = $state<HTMLElement | null>(null);

  $effect(() => {
    const el = stripEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) laneWidth = entry.contentRect.width;
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Two-pass width budget: reserve room for the persistent "+" first; only
  // reserve the overflow chevron's width as well once the first pass shows
  // something actually overflows. This stops a tab being hidden behind a
  // chevron when dropping the chevron would have let every tab fit.
  const CONTROL_WIDTH_PX = 44;
  const partition = $derived.by(() => {
    const budget = (reserved: number) =>
      Number.isFinite(laneWidth) ? Math.max(0, laneWidth - reserved) : laneWidth;
    const firstPass = partitionTabs(
      tabViews,
      workspace.activeId,
      budget(CONTROL_WIDTH_PX),
      TAB_WIDTH_PX,
    );
    if (firstPass.hidden.length === 0) return firstPass;
    return partitionTabs(
      tabViews,
      workspace.activeId,
      budget(CONTROL_WIDTH_PX * 2),
      TAB_WIDTH_PX,
    );
  });
  const visibleTabs = $derived(partition.visible);
  const hiddenTabs = $derived(partition.hidden);
  const showClose = $derived(tabHasClose(tabViews.length));

  let dragIndex = $state<number | null>(null);
  let dragOverId = $state<string | null>(null);

  // Inline rename state. The edit is bound to the tab it started on; editing
  // ends if the active tab changes (the input only ever shows on the active
  // tab, so a switch must not let a pending edit land on the new tab's name).
  let isEditingName = $state(false);
  let editNameValue = $state("");
  let editingTabId = $state<string | null>(null);
  let nameInputElement = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!isEditingName) return;
    const frame = requestAnimationFrame(() => {
      nameInputElement?.focus();
      nameInputElement?.select();
    });
    return () => cancelAnimationFrame(frame);
  });

  // Abandon an in-progress rename when the active tab changes, so a half-typed
  // name never commits onto a different layout.
  $effect(() => {
    if (isEditingName && workspace.activeId !== editingTabId) {
      cancelEditingName();
    }
  });

  function focusTabById(id: string): void {
    const el = document.getElementById(`layout-tab-${id}`);
    el?.focus();
  }

  function handleTabKeydown(event: KeyboardEvent, id: string): void {
    // Only handle keys aimed at the tab itself; let Enter/Space on a nested
    // control (the close button) reach it.
    if (event.target !== event.currentTarget) return;

    const order = visibleTabs;
    const count = order.length;
    if (count === 0) return;
    const index = order.findIndex((t) => t.id === id);

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTabById(order[(index + 1) % count]!.id);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTabById(order[(index - 1 + count) % count]!.id);
        break;
      case "Home":
        event.preventDefault();
        focusTabById(order[0]!.id);
        break;
      case "End":
        event.preventDefault();
        focusTabById(order[count - 1]!.id);
        break;
      case "Enter":
      case " ":
        // A div with role="tab" does not activate on Enter/Space natively.
        event.preventDefault();
        workspace.switchTo(id);
        break;
    }
  }

  // Drag-to-reorder works against the full tab order (workspace.tabs), not the
  // visible subset, so reordering stays correct when tabs are overflowed.
  function tabIndex(id: string): number {
    return workspace.tabs.findIndex((t) => t.id === id);
  }

  function handleDragStart(event: DragEvent, id: string): void {
    dragIndex = tabIndex(id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(dragIndex));
    }
  }

  function handleDragOver(event: DragEvent, id: string): void {
    if (dragIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragOverId = id;
  }

  function handleDrop(event: DragEvent, id: string): void {
    event.preventDefault();
    const toIndex = tabIndex(id);
    if (dragIndex !== null && dragIndex !== toIndex) {
      workspace.reorderTabs(dragIndex, toIndex);
    }
    dragIndex = null;
    dragOverId = null;
  }

  function handleDragEnd(): void {
    dragIndex = null;
    dragOverId = null;
  }

  function handleClose(event: MouseEvent, id: string): void {
    event.stopPropagation();
    workspace.closeTab(id);
  }

  function handleNewLayout(): void {
    workspace.openTab();
  }

  // Inline rename, double-click on the active tab only.
  function startEditingName(id: string): void {
    if (id !== workspace.activeId) return;
    editNameValue = workspace.activeStore.layout.name;
    editingTabId = id;
    isEditingName = true;
  }

  function commitName(): void {
    const trimmed = editNameValue.trim();
    if (trimmed) workspace.activeStore.setLayoutName(trimmed);
    isEditingName = false;
    editingTabId = null;
  }

  function cancelEditingName(): void {
    isEditingName = false;
    editingTabId = null;
  }

  function handleNameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingName();
    }
  }

  // Context-menu actions, mirroring the Layouts sidebar (LayoutsLibrary).
  function contextRename(id: string): void {
    workspace.switchTo(id);
    startEditingName(id);
  }

  function contextDuplicate(id: string): void {
    const tab = workspace.tabs.find((t) => t.id === id);
    if (!tab) return;
    const source = tab.store.layout;
    const existingNames = workspace.tabs.map((t) => t.store.layout.name);
    const name = nextDuplicateName(existingNames, source.name);
    const clone: Layout = structuredClone($state.snapshot(source));
    clone.name = name;
    clone.metadata = { ...clone.metadata, id: generateId(), name };
    workspace.openTab(clone);
  }
</script>

<div
  class="layout-tabs"
  bind:this={stripEl}
  role="tablist"
  aria-label="Open layouts"
>
  {#each visibleTabs as view (view.id)}
    {@const selected = view.id === workspace.activeId}
    <LayoutContextMenu
      onrename={() => contextRename(view.id)}
      onduplicate={() => contextDuplicate(view.id)}
      onexport={onexport ? () => onexport(view.id) : undefined}
      ondelete={showClose ? () => workspace.closeTab(view.id) : undefined}
    >
      {#if selected && isEditingName}
        <input
          bind:this={nameInputElement}
          class="layout-tab-input"
          type="text"
          bind:value={editNameValue}
          onkeydown={handleNameKeydown}
          onblur={() => isEditingName && commitName()}
          aria-label="Layout name"
          data-testid="layout-name-input"
        />
      {:else}
        <!--
          The tab is a div with role="tab" so the close affordance can be a real
          nested button without a button-in-button. The div carries roving
          tabindex, aria-selected, click and key activation, drag, and the
          double-click rename on the active tab.
        -->
        <div
          id="layout-tab-{view.id}"
          class="layout-tab"
          class:active={selected}
          class:drag-over={dragOverId === view.id &&
            dragIndex !== tabIndex(view.id)}
          role="tab"
          aria-selected={selected}
          tabindex={selected ? 0 : -1}
          data-testid="layout-tab-{view.id}"
          draggable="true"
          onclick={() => workspace.switchTo(view.id)}
          ondblclick={() => startEditingName(view.id)}
          onkeydown={(e) => handleTabKeydown(e, view.id)}
          ondragstart={(e) => handleDragStart(e, view.id)}
          ondragover={(e) => handleDragOver(e, view.id)}
          ondrop={(e) => handleDrop(e, view.id)}
          ondragend={handleDragEnd}
        >
          {#if view.unbacked}
            <span class="layout-tab-dot" aria-hidden="true"></span>
            <span class="sr-only">{view.statusLabel}.</span>
          {/if}
          <span class="layout-tab-label">{view.name}</span>
          {#if showClose}
            <button
              type="button"
              class="layout-tab-close"
              aria-label={`Close ${view.name}`}
              data-testid="layout-tab-close-{view.id}"
              onclick={(e) => handleClose(e, view.id)}
            >
              <IconClose size={ICON_SIZE.sm} />
            </button>
          {/if}
        </div>
      {/if}
    </LayoutContextMenu>
  {/each}

  <button
    type="button"
    class="layout-tab-add"
    aria-label="New layout"
    data-testid="btn-new-layout-tab"
    onclick={handleNewLayout}
  >
    <IconPlus size={ICON_SIZE.sm} />
  </button>

  {#if hiddenTabs.length > 0}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="layout-tab-overflow"
            aria-label={`${hiddenTabs.length} more layout${hiddenTabs.length === 1 ? "" : "s"}`}
            data-testid="layout-tabs-overflow"
          >
            <IconChevronDown size={ICON_SIZE.sm} />
            <span class="layout-tab-overflow-badge">{hiddenTabs.length}</span>
          </button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class="menu-content menu-inline"
          sideOffset={4}
          align="end"
        >
          {#each hiddenTabs as view (view.id)}
            <DropdownMenu.Item
              class="menu-item"
              data-testid="layout-tabs-overflow-item-{view.id}"
              onSelect={() => workspace.switchTo(view.id)}
            >
              {#if view.unbacked}
                <span class="layout-tab-dot" aria-hidden="true"></span>
                <span class="sr-only">{view.statusLabel}.</span>
              {/if}
              <span class="menu-label">{view.name}</span>
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {/if}
</div>

<style>
  .layout-tabs {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  /* Layout-only rules. The raised "layered sheet" look (background, colour,
     top accent, rounded top corners, active merge) is shared via tabs.css. */
  .layout-tab {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    max-width: 220px;
    /* Hit area: fills the bar height (~44px). Visible pill is inset via padding. */
    height: 44px;
    padding: 6px var(--space-1) 6px var(--space-2);
    border: 1px solid transparent;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .layout-tab.drag-over {
    border-color: var(--colour-selection);
  }

  .layout-tab:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .layout-tab-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .layout-tab-input {
    min-width: 120px;
    max-width: 220px;
    height: 44px;
    padding: 0 var(--space-2);
    border: 1px solid var(--dracula-cyan);
    border-radius: var(--radius-sm);
    background: var(--colour-surface);
    color: var(--colour-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    font-family: inherit;
    outline: none;
  }

  .layout-tab-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--colour-warning, var(--colour-selection));
  }

  .layout-tab-close {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .layout-tab-close:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .layout-tab-close:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .layout-tab-add,
  .layout-tab-overflow {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    /* Match tab hit area: 44px tall, at least 44px wide. */
    width: 44px;
    height: 44px;
    padding: 0 var(--space-1);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .layout-tab-add:hover,
  .layout-tab-overflow:hover,
  .layout-tab-overflow[data-state="open"] {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .layout-tab-add:focus-visible,
  .layout-tab-overflow:focus-visible {
    outline: none;
    color: var(--colour-text);
    box-shadow:
      0 0 0 2px var(--colour-bg),
      0 0 0 4px var(--colour-focus-ring);
  }

  .layout-tab-overflow-badge {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-variant-numeric: tabular-nums;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .layout-tab,
    .layout-tab-close,
    .layout-tab-add,
    .layout-tab-overflow {
      transition: none;
    }
  }
</style>
