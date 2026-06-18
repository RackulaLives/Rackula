<!--
  SidebarTabs Component
  Tab bar for sidebar navigation: Layouts | Racks | Devices
  Uses bits-ui Tabs for accessibility and keyboard navigation.

  The collapse chevron (`«`) sits at the far-left of the row and collapses the
  panel leftward to its 44px strip, mirroring the right panel's `»` (issue #2397).
-->
<script lang="ts">
  import { Tabs } from "$lib/components/ui/Tabs";
  import { IconChevronLeft } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type { SidebarTab } from "$lib/stores/ui.svelte";
  import "$lib/styles/tabs.css";

  interface Props {
    activeTab: SidebarTab;
    onchange: (tab: SidebarTab) => void;
    /** Collapse the sidebar leftward to its strip. */
    oncollapse: () => void;
  }

  let { activeTab, onchange, oncollapse }: Props = $props();

  const tabs: { id: SidebarTab; label: string; icon: string }[] = [
    { id: "layouts", label: "Layouts", icon: "▦" },
    { id: "racks", label: "Racks", icon: "▤" },
    { id: "devices", label: "Devices", icon: "⬡" },
  ];

  function handleValueChange(value: string | undefined) {
    if (value) {
      onchange(value as SidebarTab);
    }
  }
</script>

<div class="sidebar-tabs-row">
  <button
    type="button"
    class="sidebar-collapse-btn"
    aria-label="Collapse panel"
    aria-expanded="true"
    onclick={oncollapse}
    data-testid="sidebar-collapse"
  >
    <IconChevronLeft size={ICON_SIZE.md} />
  </button>

  <Tabs.Root
    value={activeTab}
    onValueChange={handleValueChange}
    orientation="horizontal"
    loop={true}
    class="sidebar-tabs"
  >
    <Tabs.List class="tabs-list" aria-label="Sidebar navigation">
      {#each tabs as tab (tab.id)}
        <Tabs.Trigger
          value={tab.id}
          class="tab-btn"
          data-testid="sidebar-tab-{tab.id}"
        >
          <span class="tab-icon" aria-hidden="true">{tab.icon}</span>
          <span class="tab-label">{tab.label}</span>
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>
</div>

<style>
  .sidebar-tabs-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    padding: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-sidebar-bg);
    flex-shrink: 0;
  }

  /* 44px-square collapse control, matching the tab height (issue #2397). */
  .sidebar-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--panel-collapsed-strip-width, 44px);
    height: var(--panel-collapsed-strip-width, 44px);
    flex-shrink: 0;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .sidebar-collapse-btn:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .sidebar-collapse-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  :global(.sidebar-tabs) {
    display: contents;
  }

  :global(.tabs-list) {
    display: flex;
    flex: 1;
    gap: var(--space-1);
    min-width: 0;
  }

  /* Layout-only rules. The raised "layered sheet" look (background, colour, top
     accent, rounded top corners, active merge) is shared via tabs.css. */
  :global(.tab-btn) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    /* 44px control height, matching the right panel and touch standard (#2397). */
    min-height: 44px;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  :global(.tab-btn:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .tab-icon {
    font-size: var(--font-size-base);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-collapse-btn,
    :global(.tab-btn) {
      transition: none;
    }
  }
</style>
