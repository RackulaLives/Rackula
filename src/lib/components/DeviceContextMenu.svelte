<!--
  DeviceContextMenu Component
  Right-click context menu for placed devices in racks.
  Uses bits-ui ContextMenu with dark overlay styling matching ToolbarMenu.
-->
<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import type { Snippet } from "svelte";

  interface Props {
    /** Whether the menu is open */
    open?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
    /** Edit device callback */
    onedit?: () => void;
    /** Duplicate device callback */
    onduplicate?: () => void;
    /** Move device up callback */
    onmoveup?: () => void;
    /** Move device down callback */
    onmovedown?: () => void;
    /** Delete device callback */
    ondelete?: () => void;
    /** Whether move up is available */
    canMoveUp?: boolean;
    /** Whether move down is available */
    canMoveDown?: boolean;
    /** Trigger element (the device) */
    children: Snippet;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    onedit,
    onduplicate,
    onmoveup,
    onmovedown,
    ondelete,
    canMoveUp = true,
    canMoveDown = true,
    children,
  }: Props = $props();

  function handleSelect(action?: () => void) {
    return () => {
      action?.();
      open = false;
    };
  }

  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    onOpenChange?.(newOpen);
  }
</script>

<ContextMenu.Root {open} onOpenChange={handleOpenChange}>
  <ContextMenu.Trigger asChild>
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Portal>
    <ContextMenu.Content class="context-menu-content" sideOffset={5}>
      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onedit)}
      >
        <span class="context-menu-label">Edit</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onduplicate)}
      >
        <span class="context-menu-label">Duplicate</span>
        <span class="context-menu-shortcut">Ctrl+D</span>
      </ContextMenu.Item>

      <ContextMenu.Separator class="context-menu-separator" />

      <ContextMenu.Item
        class="context-menu-item"
        disabled={!canMoveUp}
        onSelect={handleSelect(onmoveup)}
      >
        <span class="context-menu-label">Move Up</span>
        <span class="context-menu-shortcut">&uarr;</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        disabled={!canMoveDown}
        onSelect={handleSelect(onmovedown)}
      >
        <span class="context-menu-label">Move Down</span>
        <span class="context-menu-shortcut">&darr;</span>
      </ContextMenu.Item>

      <ContextMenu.Separator class="context-menu-separator" />

      <ContextMenu.Item
        class="context-menu-item context-menu-item--destructive"
        onSelect={handleSelect(ondelete)}
      >
        <span class="context-menu-label">Delete</span>
        <span class="context-menu-shortcut">Del</span>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>

<style>
  /*
   * Portal-rendered styles require :global() because ContextMenu.Portal
   * renders content outside the component tree (in document.body).
   * Svelte's scoped styles won't apply without :global().
   */
  :global(.context-menu-content) {
    z-index: var(--z-dropdown, 100);
    min-width: 160px;
    padding: var(--space-2);
    background-color: var(--colour-surface-overlay);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    animation: context-menu-fade-in var(--duration-fast) var(--ease-out);
  }

  @keyframes context-menu-fade-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Menu items */
  :global(.context-menu-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-out);
    outline: none;
  }

  :global(.context-menu-item:hover),
  :global(.context-menu-item[data-highlighted]) {
    background-color: var(--colour-overlay-hover);
  }

  :global(.context-menu-item:focus-visible) {
    background-color: var(--colour-overlay-hover);
  }

  :global(.context-menu-item[data-disabled]) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  :global(.context-menu-item--destructive) {
    color: var(--colour-error);
  }

  :global(.context-menu-item--destructive:hover),
  :global(.context-menu-item--destructive[data-highlighted]) {
    background-color: color-mix(in srgb, var(--colour-error) 15%, transparent);
  }

  :global(.context-menu-label) {
    flex: 1;
  }

  :global(.context-menu-shortcut) {
    padding: 2px 6px;
    background-color: var(--colour-overlay-hover);
    border-radius: 3px;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-muted-inverse);
  }

  /* Separator */
  :global(.context-menu-separator) {
    height: 1px;
    margin: var(--space-2) 0;
    background-color: var(--colour-overlay-border);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    :global(.context-menu-content) {
      animation: none;
    }
  }
</style>
