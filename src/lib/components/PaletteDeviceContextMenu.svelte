<!--
  PaletteDeviceContextMenu Component
  Right-click context menu for custom device types in the device palette.
  Shows a "Delete from Library" action for custom (user-defined) devices.
  Uses bits-ui ContextMenu in virtual trigger mode.
-->
<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import "$lib/styles/context-menus.css";

  interface Props {
    /** Whether the menu is open */
    open?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
    /** Delete device callback */
    onDelete?: () => void;
    /** X coordinate for virtual trigger (screen position) */
    x?: number;
    /** Y coordinate for virtual trigger (screen position) */
    y?: number;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    onDelete,
    x = 0,
    y = 0,
  }: Props = $props();

  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    onOpenChange?.(newOpen);
  }
</script>

<ContextMenu.Root {open} onOpenChange={handleOpenChange}>
  <ContextMenu.Trigger>
    <div
      style="position: fixed; left: {x}px; top: {y}px; width: 1px; height: 1px; pointer-events: none;"
    ></div>
  </ContextMenu.Trigger>

  <ContextMenu.Portal>
    <ContextMenu.Content class="context-menu-content" sideOffset={5}>
      <ContextMenu.Item
        class="context-menu-item context-menu-item--destructive"
        onSelect={() => {
          onDelete?.();
          open = false;
        }}
      >
        <span class="context-menu-label">Delete from Library</span>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
