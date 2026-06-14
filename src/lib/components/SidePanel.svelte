<!--
  SidePanel Component

  The persistent right-side panel chrome: a collapsible surface that hosts the
  tabbed Edit/View content (SidePanelContent) and collapses to a slim rail to give
  the canvas its width back. Collapse state and the active tab are remembered across
  sessions via the UI store.

  This chrome is desktop and tablet only. On phone the same SidePanelContent is
  composed inside a bottom sheet instead (mobile spike #2097); the rail does not
  appear there. Keep the collapse-to-rail behaviour here, not in SidePanelContent,
  so the content stays extractable.

  Accessibility (issue #2076 ACs): the panel is a labelled landmark; collapse and
  expand manage focus rather than dropping it to the body. Collapsing returns focus
  to the rail toggle; expanding moves focus to the active tabpanel's heading.
-->
<script lang="ts">
  import SidePanelContent from "./SidePanelContent.svelte";
  import { IconChevronLeft, IconChevronRight } from "./icons";
  import { getUIStore, type SidePanelTab } from "$lib/stores/ui.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";

  const uiStore = getUIStore();
  const selectionStore = getSelectionStore();

  const EDIT_HEADING_ID = "side-panel-edit-heading";
  const VIEW_HEADING_ID = "side-panel-view-heading";

  let railToggleEl = $state<HTMLButtonElement | null>(null);
  let panelEl = $state<HTMLElement | null>(null);

  // Track the previous collapsed value so focus only moves on a genuine
  // user-driven transition, not on initial mount.
  let prevCollapsed = uiStore.sidePanelCollapsed;

  // When a new selection is made, surface its properties: switch to the Edit
  // tab and reveal the panel if it was collapsed. Tracking the previous value
  // means switching to the View tab while a selection persists is not undone.
  let prevHasSelection = selectionStore.hasSelection;
  $effect(() => {
    const hasSelection = selectionStore.hasSelection;
    if (hasSelection === prevHasSelection) return;
    prevHasSelection = hasSelection;

    if (hasSelection) {
      uiStore.setSidePanelTab("edit");
      uiStore.setSidePanelCollapsed(false);
    }
  });

  $effect(() => {
    const collapsed = uiStore.sidePanelCollapsed;
    if (collapsed === prevCollapsed) return;
    prevCollapsed = collapsed;

    const frame = requestAnimationFrame(() => {
      if (collapsed) {
        // Collapsed: only the rail toggle remains; keep focus on it.
        railToggleEl?.focus();
      } else {
        // Expanded: move focus into the panel, onto the active tab's heading.
        const headingId =
          uiStore.sidePanelTab === "view" ? VIEW_HEADING_ID : EDIT_HEADING_ID;
        const heading = panelEl?.querySelector<HTMLElement>(`#${headingId}`);
        heading?.focus();
      }
    });

    return () => cancelAnimationFrame(frame);
  });

  function handleTabChange(tab: SidePanelTab) {
    uiStore.setSidePanelTab(tab);
  }

  function expand() {
    uiStore.setSidePanelCollapsed(false);
  }

  function collapse() {
    uiStore.setSidePanelCollapsed(true);
  }
</script>

<aside
  bind:this={panelEl}
  class="side-panel"
  class:collapsed={uiStore.sidePanelCollapsed}
  aria-label="Edit and view panel"
  data-testid="side-panel"
>
  {#if uiStore.sidePanelCollapsed}
    <button
      bind:this={railToggleEl}
      type="button"
      class="rail-toggle"
      onclick={expand}
      aria-expanded="false"
      aria-label="Expand panel"
      data-testid="side-panel-expand"
    >
      <IconChevronLeft size={18} />
    </button>
  {:else}
    <div class="side-panel-header">
      <button
        bind:this={railToggleEl}
        type="button"
        class="collapse-toggle"
        onclick={collapse}
        aria-expanded="true"
        aria-label="Collapse panel"
        data-testid="side-panel-collapse"
      >
        <IconChevronRight size={18} />
      </button>
    </div>
    <div class="side-panel-body">
      <SidePanelContent
        activeTab={uiStore.sidePanelTab}
        onTabChange={handleTabChange}
        editHeadingId={EDIT_HEADING_ID}
        viewHeadingId={VIEW_HEADING_ID}
      />
    </div>
  {/if}
</aside>

<style>
  .side-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    /* Fixed width so the canvas keeps a stable size (and a stable fit-to-view
       zoom) regardless of the panel's content. */
    width: var(--side-panel-width, 320px);
    flex-shrink: 0;
    background: var(--drawer-bg);
    border-left: 1px solid var(--colour-border);
    overflow: hidden;
    transition: width var(--duration-normal) var(--ease-in-out);
  }

  .side-panel.collapsed {
    width: var(--side-panel-rail-width, 2.75rem);
    align-items: center;
  }

  .side-panel-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
    flex-shrink: 0;
  }

  .side-panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* 44px minimum touch target for both toggle affordances. */
  .rail-toggle,
  .collapse-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .rail-toggle {
    margin-top: var(--space-2);
  }

  .rail-toggle:hover,
  .collapse-toggle:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .rail-toggle:focus-visible,
  .collapse-toggle:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .side-panel,
    .rail-toggle,
    .collapse-toggle {
      transition: none;
    }
  }
</style>
