<!--
  LayoutTabs Component
  Tab strip for the open layouts in the workspace. Each tab switches the active
  layout; a per-tab close affordance removes it from the open set (the layout
  itself is not deleted). Tabs can be dragged to reorder.

  Accessibility:
  - role="tablist" / role="tab" with aria-selected on the active tab.
  - Roving tabindex: only the active tab is in the tab order; ArrowLeft/Right
    move focus between tabs (Home/End jump to first/last).
  - The unbacked-changes dot carries accessible text (never colour alone,
    WCAG 1.4.1); the close control has an accessible name.
  - The close button is a sibling of the tab button, not nested inside it
    (no button-in-button), so each tab exposes two distinct controls.
-->
<script lang="ts">
  import { getWorkspaceStore } from "$lib/stores/workspace.svelte";
  import { getLayoutDurability } from "$lib/storage";
  import { IconClose } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";

  const workspace = getWorkspaceStore();

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

  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  function focusTabAt(index: number): void {
    const tab = workspace.tabs[index];
    if (!tab) return;
    const el = document.getElementById(`layout-tab-${tab.id}`);
    el?.focus();
  }

  function handleTabKeydown(
    event: KeyboardEvent,
    index: number,
    id: string,
  ): void {
    // Only handle keys aimed at the tab itself. When focus is on the nested
    // close button, let Enter/Space reach it so keyboard close still works
    // instead of being swallowed as tab activation.
    if (event.target !== event.currentTarget) return;

    const count = workspace.tabs.length;
    if (count === 0) return;

    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        focusTabAt((index + 1) % count);
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        focusTabAt((index - 1 + count) % count);
        break;
      }
      case "Home": {
        event.preventDefault();
        focusTabAt(0);
        break;
      }
      case "End": {
        event.preventDefault();
        focusTabAt(count - 1);
        break;
      }
      case "Enter":
      case " ": {
        // A div with role="tab" does not activate on Enter/Space natively.
        event.preventDefault();
        workspace.switchTo(id);
        break;
      }
    }
  }

  function handleDragStart(event: DragEvent, index: number): void {
    dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      // Some browsers require data to be set for a drag to start.
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(event: DragEvent, index: number): void {
    if (dragIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragOverIndex = index;
  }

  function handleDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      workspace.reorderTabs(dragIndex, index);
    }
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd(): void {
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleClose(event: MouseEvent, id: string): void {
    // Keep the click from also selecting the tab.
    event.stopPropagation();
    workspace.closeTab(id);
  }
</script>

{#if tabViews.length > 1}
  <div class="layout-tabs" role="tablist" aria-label="Open layouts">
    {#each tabViews as view, index (view.id)}
      {@const selected = view.id === workspace.activeId}
      <!--
        The tab is a div with role="tab" (a direct child of the tablist) so the
        close affordance can be a real nested button without a button-in-button.
        The div carries roving tabindex, aria-selected, click and key activation.
      -->
      <div
        id="layout-tab-{view.id}"
        class="layout-tab"
        class:active={selected}
        class:drag-over={dragOverIndex === index && dragIndex !== index}
        role="tab"
        aria-selected={selected}
        tabindex={selected ? 0 : -1}
        data-testid="layout-tab-{view.id}"
        draggable="true"
        onclick={() => workspace.switchTo(view.id)}
        onkeydown={(e) => handleTabKeydown(e, index, view.id)}
        ondragstart={(e) => handleDragStart(e, index)}
        ondragover={(e) => handleDragOver(e, index)}
        ondrop={(e) => handleDrop(e, index)}
        ondragend={handleDragEnd}
      >
        {#if view.unbacked}
          <span class="layout-tab-dot" aria-hidden="true"></span>
          <span class="sr-only">{view.statusLabel}.</span>
        {/if}
        <span class="layout-tab-label">{view.name}</span>
        <button
          type="button"
          class="layout-tab-close"
          aria-label={`Close ${view.name}`}
          data-testid="layout-tab-close-{view.id}"
          onclick={(e) => handleClose(e, view.id)}
        >
          <IconClose size={ICON_SIZE.sm} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .layout-tabs {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: var(--colour-sidebar-bg);
    border-bottom: 1px solid var(--colour-border);
    overflow: hidden;
  }

  .layout-tab {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    /* Comfortable minimum near 120px; the active tab keeps room for its label
       and close button. The hard floor / chevron overflow is a follow-up. */
    min-width: 120px;
    max-width: 220px;
    min-height: 44px;
    padding: 0 var(--space-1) 0 var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .layout-tab:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .layout-tab.active {
    background: var(--colour-surface-active);
    border-color: var(--colour-border);
    color: var(--colour-text);
  }

  .layout-tab.drag-over {
    border-color: var(--colour-selection);
  }

  .layout-tab:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .layout-tab-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    margin-right: var(--space-1);
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
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
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
    .layout-tab-close {
      transition: none;
    }
  }
</style>
