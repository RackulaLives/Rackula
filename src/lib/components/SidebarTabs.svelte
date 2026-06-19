<!--
  SidebarTabs Component
  Segmented navigation for the sidebar: Layouts | Racks | Devices
  Uses bits-ui Tabs for accessibility and keyboard navigation.

  Styled to match the Brand / Category / A-Z SegmentedControl directly below it
  (issue #2435): one connected row of square segments with a filled active
  segment, rather than the raised tab-bar sheets used elsewhere.

  The collapse chevron (`«`) sits at the far-left of the row and collapses the
  panel leftward to its 44px strip, mirroring the right panel's `»` (issue #2397).
-->
<script lang="ts">
  import { Tabs } from "$lib/components/ui/Tabs";
  import { IconChevronLeft } from "./icons";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import type { SidebarTab } from "$lib/stores/ui.svelte";

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
    <Tabs.List class="sidebar-segments" aria-label="Sidebar navigation">
      {#each tabs as tab (tab.id)}
        <Tabs.Trigger
          value={tab.id}
          class="sidebar-segment"
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

  /* 44px-square collapse control, matching the segment height (issue #2397). */
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

  /* Connected segmented row, matching the Brand / Category / A-Z control. */
  :global(.sidebar-segments) {
    display: flex;
    flex: 1;
    gap: 0;
    min-width: 0;
  }

  /* Square segments with collapsed borders and a filled active state, mirroring
     SegmentedControl. Rounded corners only on the row ends. */
  :global(.sidebar-segment) {
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
    background: transparent;
    border: 1px solid var(--colour-border);
    border-radius: 0;
    color: var(--colour-text-muted);
    cursor: pointer;
    /* Collapse adjacent borders so the row reads as one connected control. */
    margin-left: -1px;
    position: relative;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  :global(.sidebar-segment:first-child) {
    margin-left: 0;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  }

  :global(.sidebar-segment:last-child) {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  :global(.sidebar-segment:hover:not([data-state="active"])) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.sidebar-segment[data-state="active"]) {
    background: color-mix(in srgb, var(--colour-selection) 20%, transparent);
    border-color: var(--colour-selection);
    color: var(--colour-text);
    z-index: 1;
  }

  :global(.sidebar-segment:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
    z-index: 2;
  }

  .tab-icon {
    font-size: var(--font-size-base);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar-collapse-btn,
    :global(.sidebar-segment) {
      transition: none;
    }
  }
</style>
