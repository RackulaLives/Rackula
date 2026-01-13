<!--
  SidebarTabs Component
  Tab bar for sidebar navigation: Hide | Devices | Racks
  Uses bits-ui Tabs for accessibility and keyboard navigation
-->
<script lang="ts">
  import { Tabs } from "$lib/components/ui/Tabs";
  import type { SidebarTab } from "$lib/stores/ui.svelte";

  interface Props {
    activeTab: SidebarTab;
    onchange: (tab: SidebarTab) => void;
  }

  let { activeTab, onchange }: Props = $props();

  const tabs: { id: SidebarTab; label: string; icon: string }[] = [
    { id: "hide", label: "Hide", icon: "←" },
    { id: "devices", label: "Devices", icon: "⬡" },
    { id: "racks", label: "Racks", icon: "▤" },
  ];

  function handleValueChange(value: string | undefined) {
    if (value) {
      onchange(value as SidebarTab);
    }
  }
</script>

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

<style>
  :global(.sidebar-tabs) {
    display: contents;
  }

  :global(.tabs-list) {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-sidebar-bg);
  }

  :global(.tab-btn) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  :global(.tab-btn:hover) {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  :global(.tab-btn[data-state="active"]) {
    background: var(--colour-surface-active);
    border-color: var(--colour-border);
    color: var(--colour-text);
  }

  :global(.tab-btn:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .tab-icon {
    font-size: var(--font-size-base);
  }

  /* Hide labels on very narrow sidebars */
  @media (max-width: 280px) {
    .tab-label {
      display: none;
    }
  }
</style>
