<!--
  RackContextMenu Component
  Right-click context menu for racks on the canvas.
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
    /** Add device callback (opens device library) */
    onadddevice?: () => void;
    /** Edit rack callback (opens rack settings) */
    onedit?: () => void;
    /** Rename rack callback */
    onrename?: () => void;
    /** Duplicate rack callback */
    onduplicate?: () => void;
    /** Delete rack callback */
    ondelete?: () => void;
    /** Trigger element (the rack) */
    children: Snippet;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    onadddevice,
    onedit,
    onrename,
    onduplicate,
    ondelete,
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
        onSelect={handleSelect(onadddevice)}
      >
        <span class="context-menu-label">Add Device</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onedit)}
      >
        <span class="context-menu-label">Edit Rack</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onrename)}
      >
        <span class="context-menu-label">Rename</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onduplicate)}
      >
        <span class="context-menu-label">Duplicate Rack</span>
      </ContextMenu.Item>

      <ContextMenu.Separator class="context-menu-separator" />

      <ContextMenu.Item
        class="context-menu-item context-menu-item--destructive"
        onSelect={handleSelect(ondelete)}
      >
        <span class="context-menu-label">Delete Rack</span>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
