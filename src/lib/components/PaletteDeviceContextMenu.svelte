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
    ondelete?: () => void;
    /** X coordinate for virtual trigger (screen position) */
    x?: number;
    /** Y coordinate for virtual trigger (screen position) */
    y?: number;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    ondelete,
    x = 0,
    y = 0,
  }: Props = $props();

  // Anchor the menu to the cursor's viewport coordinates via a Measurable
  // virtual element. The menu is opened programmatically (the real right-click
  // lands on the palette item, not on a bits-ui trigger), so without an anchor
  // bits-ui positions the menu at the top-left origin.
  const virtualAnchor = $derived({
    getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
  });

  function handleOpenChange(newOpen: boolean) {
    open = newOpen;
    onOpenChange?.(newOpen);
  }
</script>

<ContextMenu.Root {open} onOpenChange={handleOpenChange}>
  <!-- Virtual trigger mode: opened programmatically, positioned via customAnchor. -->
  <ContextMenu.Trigger />

  <ContextMenu.Portal>
    <ContextMenu.Content
      class="context-menu-content"
      sideOffset={5}
      customAnchor={virtualAnchor}
    >
      <ContextMenu.Item
        class="context-menu-item context-menu-item--destructive"
        onSelect={() => {
          ondelete?.();
          open = false;
        }}
      >
        <span class="context-menu-label">Delete from Library</span>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
