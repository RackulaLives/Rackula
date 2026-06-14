<!--
  PaletteDeviceContextMenu Component
  Right-click context menu for device types in the device palette.
  Always offers a pin/unpin action; custom (user-defined) devices also get a
  "Delete from Library" action. Uses bits-ui ContextMenu in virtual trigger mode.
-->
<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import "$lib/styles/context-menus.css";

  interface Props {
    /** Whether the menu is open */
    open?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
    /** Whether the device is currently pinned (favourited) */
    isFavourite?: boolean;
    /** Whether the delete action should be offered (unused custom devices only) */
    canDelete?: boolean;
    /** Pin/unpin device callback */
    ontogglefavourite?: () => void;
    /** Delete device callback */
    ondelete?: () => void;
    /** X coordinate for the menu anchor (cursor screen position). Required: a
     *  default would silently pin the menu to the top-left origin. */
    x: number;
    /** Y coordinate for the menu anchor (cursor screen position). Required: a
     *  default would silently pin the menu to the top-left origin. */
    y: number;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    isFavourite = false,
    canDelete = false,
    ontogglefavourite,
    ondelete,
    x,
    y,
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
      data-testid="ctx-menu"
      sideOffset={5}
      customAnchor={virtualAnchor}
    >
      <ContextMenu.Item
        class="context-menu-item"
        data-testid="ctx-menu-favourite"
        onSelect={() => {
          ontogglefavourite?.();
          open = false;
        }}
      >
        <span class="context-menu-label"
          >{isFavourite ? "Unpin from top" : "Pin to top"}</span
        >
      </ContextMenu.Item>

      {#if canDelete}
        <ContextMenu.Separator class="context-menu-separator" />
        <ContextMenu.Item
          class="context-menu-item context-menu-item--destructive"
          data-testid="ctx-menu-item"
          onSelect={() => {
            ondelete?.();
            open = false;
          }}
        >
          <span class="context-menu-label">Delete from Library</span>
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
