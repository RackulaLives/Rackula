<!--
  LayoutContextMenu Component
  Right-click context menu for a layout row in the Layouts sidebar tab.
  Uses bits-ui ContextMenu with the shared context-menu styling.

  Menu items:
  - Open (switch to / open the layout)
  - Rename
  - Duplicate
  - Export...
  - [separator]
  - Delete (destructive)
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
    /** Open/switch-to layout callback */
    onopen?: () => void;
    /** Rename layout callback */
    onrename?: () => void;
    /** Duplicate layout callback */
    onduplicate?: () => void;
    /** Export layout callback */
    onexport?: () => void;
    /** Delete (close) layout callback */
    ondelete?: () => void;
    /** Trigger element (the layout row) */
    children: Snippet;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    onopen,
    onrename,
    onduplicate,
    onexport,
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
  <ContextMenu.Trigger>
    {@render children()}
  </ContextMenu.Trigger>

  <ContextMenu.Portal>
    <ContextMenu.Content
      class="context-menu-content"
      data-testid="ctx-menu"
      sideOffset={5}
    >
      {#if onopen}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(onopen)}
        >
          <span class="context-menu-label">Open</span>
        </ContextMenu.Item>
      {/if}

      {#if onrename}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(onrename)}
        >
          <span class="context-menu-label">Rename</span>
        </ContextMenu.Item>
      {/if}

      {#if onduplicate}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(onduplicate)}
        >
          <span class="context-menu-label">Duplicate</span>
        </ContextMenu.Item>
      {/if}

      {#if onexport}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(onexport)}
        >
          <span class="context-menu-label">Export...</span>
        </ContextMenu.Item>
      {/if}

      {#if ondelete && (onopen || onrename || onduplicate || onexport)}
        <ContextMenu.Separator class="context-menu-separator" />
      {/if}

      {#if ondelete}
        <ContextMenu.Item
          class="context-menu-item context-menu-item--destructive"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(ondelete)}
        >
          <span class="context-menu-label">Delete</span>
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
