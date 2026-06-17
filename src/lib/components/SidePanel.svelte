<!--
  SidePanel Component

  The persistent right-side panel chrome: a collapsible surface that hosts the
  tabbed Edit/View content (SidePanelContent). Collapses to a slim rail.
  Collapse state and the active tab are remembered across sessions via the UI store.

  The collapse/expand toggle has moved to the top-bar right region (#2386).
  This chrome no longer renders a header row; the panel body fills the full height.

  This chrome is desktop and tablet only. On phone the same SidePanelContent is
  composed inside a bottom sheet instead (mobile spike #2097); the rail does not
  appear there. Keep the collapse-to-rail behaviour here, not in SidePanelContent,
  so the content stays extractable.

  Accessibility (issue #2076 ACs): the panel is a labelled landmark; collapse and
  expand managed focus to the panel heading (expand) is now handled by the toolbar
  chevron interaction. Collapsing still returns focus to the rail; expanding focus
  moves into the panel.
-->
<script lang="ts">
  import SidePanelContent from "./SidePanelContent.svelte";
  import { getUIStore, type SidePanelTab } from "$lib/stores/ui.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";

  const uiStore = getUIStore();
  const selectionStore = getSelectionStore();

  const EDIT_HEADING_ID = "side-panel-edit-heading";
  const VIEW_HEADING_ID = "side-panel-view-heading";

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
      if (!collapsed) {
        // Expanded: move focus into the panel, onto the active tab's heading.
        const headingId =
          uiStore.sidePanelTab === "view" ? VIEW_HEADING_ID : EDIT_HEADING_ID;
        const heading = panelEl?.querySelector<HTMLElement>(`#${headingId}`);
        heading?.focus();
      }
      // Collapsed: the toolbar chevron retains focus (it's the button that was clicked).
    });

    return () => cancelAnimationFrame(frame);
  });

  function handleTabChange(tab: SidePanelTab) {
    uiStore.setSidePanelTab(tab);
  }
</script>

<!-- When collapsed the panel has no content and zero width; it drops its
     landmark label and is hidden from assistive tech so it is not an empty,
     navigable "Edit and view panel" region. The toolbar chevron (#2386) is the
     expand control in that state. -->
<aside
  bind:this={panelEl}
  class="side-panel"
  class:collapsed={uiStore.sidePanelCollapsed}
  aria-label={uiStore.sidePanelCollapsed ? undefined : "Edit and view panel"}
  aria-hidden={uiStore.sidePanelCollapsed ? "true" : undefined}
  data-testid="side-panel"
>
  {#if !uiStore.sidePanelCollapsed}
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
    width: 0;
    border-left: none;
  }

  .side-panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  @media (prefers-reduced-motion: reduce) {
    .side-panel {
      transition: none;
    }
  }
</style>
