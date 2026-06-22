<!--
  SidePanel Component

  The persistent right-side panel chrome: a collapsible surface that hosts the
  tabbed Edit/View content (SidePanelContent). Collapses rightward to a 44px
  strip on its outer edge (issue #2397). Collapse state and the active tab are
  remembered across sessions via the UI store.

  The collapse/expand chevron lives in the panel itself: `»` at the far-right of
  the Edit/View tab row (expanded), and the collapsed strip is one big reopen
  button. This mirrors the left panel (#2397).

  This chrome is desktop and tablet only. On phone the same SidePanelContent is
  composed inside a bottom sheet instead (mobile spike #2097); neither the strip
  nor the in-row chevron appears there. Keep the collapse-to-strip behaviour
  here, not in SidePanelContent, so the content stays extractable.

  Accessibility (issue #2076 ACs): the panel is a labelled landmark; expanding
  moves focus to the active tab's heading. Collapsing returns focus to the strip
  reopen button.
-->
<script lang="ts">
  import SidePanelContent from "./SidePanelContent.svelte";
  import CollapsedPanelStrip from "./CollapsedPanelStrip.svelte";
  import { getUIStore, type SidePanelTab } from "$lib/stores/ui.svelte";
  import { getSelectionStore } from "$lib/stores/selection.svelte";

  const uiStore = getUIStore();
  const selectionStore = getSelectionStore();

  const EDIT_HEADING_ID = "side-panel-edit-heading";
  const VIEW_HEADING_ID = "side-panel-view-heading";

  // The active tab name, shown as the collapsed strip's rotated label.
  const activeTabLabel = $derived(
    uiStore.sidePanelTab === "view" ? "View" : "Edit",
  );

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
      } else {
        // Collapsed: move focus to the strip's reopen button so keyboard users
        // are not stranded on the now-hidden in-panel chevron.
        const reopen = panelEl?.querySelector<HTMLElement>(
          '[data-testid="panel-collapsed-strip-right"]',
        );
        reopen?.focus();
      }
    });

    return () => cancelAnimationFrame(frame);
  });

  function handleTabChange(tab: SidePanelTab) {
    uiStore.setSidePanelTab(tab);
  }

  function handleCollapse() {
    uiStore.setSidePanelCollapsed(true);
  }

  function handleExpand() {
    uiStore.setSidePanelCollapsed(false);
  }
</script>

<!-- Collapsed, the panel is a 44px strip on its outer edge whose reopen button
     is the expand control (#2397); expanded, it hosts the tabbed content with an
     in-row collapse chevron. The region stays labelled in both states because
     the strip is interactive, not empty chrome. -->
<aside
  bind:this={panelEl}
  class="side-panel"
  class:collapsed={uiStore.sidePanelCollapsed}
  aria-label="Edit and view panel"
  data-testid="side-panel"
>
  {#if uiStore.sidePanelCollapsed}
    <CollapsedPanelStrip
      side="right"
      label={activeTabLabel}
      onexpand={handleExpand}
    />
  {:else}
    <div class="side-panel-body">
      <SidePanelContent
        activeTab={uiStore.sidePanelTab}
        onTabChange={handleTabChange}
        editHeadingId={EDIT_HEADING_ID}
        viewHeadingId={VIEW_HEADING_ID}
        oncollapse={handleCollapse}
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
    /* Stack above the canvas overlays (verb bar, placement indicator) so the
       panel occludes them where they overlap the canvas edge (#2491). */
    position: relative;
    z-index: var(--z-sidebar);
  }

  /* Collapsed: shrink to the 44px strip. The strip owns its own outer border. */
  .side-panel.collapsed {
    width: var(--panel-collapsed-strip-width, 44px);
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
