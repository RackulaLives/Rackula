<!--
  SidebarTabs Component
  Tab bar for sidebar navigation: Hide | Devices | Racks
-->
<script lang="ts">
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

  // Use bind:this array for focus management instead of querySelector
  let tabButtons: HTMLButtonElement[] = $state([]);

  /**
   * Handle arrow key navigation between tabs
   */
  function handleKeyDown(event: KeyboardEvent, currentIndex: number) {
    let newIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      newIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      newIndex = 0;
    } else if (event.key === "End") {
      newIndex = tabs.length - 1;
    }

    if (newIndex !== null) {
      event.preventDefault();
      const newTab = tabs[newIndex];
      if (newTab) {
        onchange(newTab.id);
        // Focus the new tab button using ref array
        tabButtons[newIndex]?.focus();
      }
    }
  }
</script>

<div class="sidebar-tabs" role="tablist" aria-label="Sidebar navigation">
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      class="tab-btn"
      class:active={activeTab === tab.id}
      aria-selected={activeTab === tab.id}
      aria-label="{tab.label} tab"
      tabindex={activeTab === tab.id ? 0 : -1}
      onclick={() => onchange(tab.id)}
      onkeydown={(e) => handleKeyDown(e, index)}
      bind:this={tabButtons[index]}
      data-testid="sidebar-tab-{tab.id}"
    >
      <span class="tab-icon" aria-hidden="true">{tab.icon}</span>
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  .sidebar-tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
    background: var(--colour-sidebar-bg);
  }

  .tab-btn {
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

  .tab-btn:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .tab-btn.active {
    background: var(--colour-surface-active);
    border-color: var(--colour-border);
    color: var(--colour-text);
  }

  .tab-btn:focus-visible {
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
