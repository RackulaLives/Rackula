<!--
  DeviceContextMenu Component
  Right-click context menu for placed devices in racks.
  Uses bits-ui ContextMenu with dark overlay styling matching ToolbarMenu.
-->
<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import type { Snippet } from "svelte";
  import "$lib/styles/context-menus.css";

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
