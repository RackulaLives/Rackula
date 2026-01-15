<!--
  FileMenu Component
  Dropdown for file operations: Save, Load, Export, Share
  Uses bits-ui DropdownMenu with Iconoir folder trigger
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import Icon from "@iconify/svelte";

  interface Props {
    onsave?: () => void;
    onload?: () => void;
    onexport?: () => void;
    onshare?: () => void;
    hasRacks?: boolean;
  }

  let { onsave, onload, onexport, onshare, hasRacks = false }: Props = $props();

  let open = $state(false);

  function handleSelect(action?: () => void) {
    return () => {
      action?.();
      open = false;
    };
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="toolbar-icon-btn" aria-label="File menu">
    <Icon icon="ph:folder-bold" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content
    class="menu-content menu-inline"
    sideOffset={4}
    align="end"
  >
    <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onsave)}>
      <span class="menu-label">Save</span>
      <span class="menu-shortcut">Ctrl+S</span>
    </DropdownMenu.Item>
    <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onload)}>
      <span class="menu-label">Load</span>
      <span class="menu-shortcut">Ctrl+O</span>
    </DropdownMenu.Item>
    <DropdownMenu.Item class="menu-item" onSelect={handleSelect(onexport)}>
      <span class="menu-label">Export</span>
      <span class="menu-shortcut">Ctrl+E</span>
    </DropdownMenu.Item>
    <DropdownMenu.Item
      class="menu-item"
      disabled={!hasRacks}
      onSelect={handleSelect(onshare)}
    >
      <span class="menu-label">Share</span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<style>
  :global(.menu-content) {
    z-index: var(--z-dropdown, 100);
    min-width: 160px;
    padding: var(--space-2);
    background-color: var(--colour-surface-overlay);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    animation: menu-fade-in var(--duration-fast) var(--ease-out);
  }

  @keyframes menu-fade-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global(.menu-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
    outline: none;
  }

  :global(.menu-item:hover),
  :global(.menu-item[data-highlighted]) {
    background-color: var(--colour-overlay-hover);
  }

  :global(.menu-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.menu-label) {
    flex: 1;
  }

  :global(.menu-shortcut) {
    padding: 2px 6px;
    background-color: var(--colour-overlay-hover);
    border-radius: 3px;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-muted-inverse);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.menu-content) {
      animation: none;
    }
  }

  :global(.menu-inline) {
    box-shadow: none;
    border: 1px solid var(--colour-border);
  }
</style>
