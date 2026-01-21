<!--
  RackContextMenu Component
  Right-click context menu for racks on the canvas and in the Racks panel.
  Uses bits-ui ContextMenu with dark overlay styling matching ToolbarMenu.

  Menu items (unified across both contexts):
  - Export...
  - Focus (pans and zooms canvas to fit the rack)
  - Edit Rack
  - Rename
  - Duplicate Rack
  - [separator]
  - Delete Rack (destructive)
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
    /** Export rack callback (opens export dialog with this rack pre-selected) */
    onexport?: () => void;
    /** Focus rack callback (pans and zooms canvas to fit this rack) */
    onfocus?: () => void;
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
    onexport,
    onfocus,
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
      {#if onexport}
        <ContextMenu.Item
          class="context-menu-item"
          onSelect={handleSelect(onexport)}
        >
          <span class="context-menu-label">Export...</span>
        </ContextMenu.Item>
      {/if}

      {#if onfocus}
        <ContextMenu.Item
          class="context-menu-item"
          onSelect={handleSelect(onfocus)}
        >
          <span class="context-menu-label">Focus</span>
        </ContextMenu.Item>
      {/if}

      {#if onedit}
        <ContextMenu.Item
          class="context-menu-item"
          onSelect={handleSelect(onedit)}
        >
          <span class="context-menu-label">Edit Rack</span>
        </ContextMenu.Item>
      {/if}

      {#if onrename}
        <ContextMenu.Item
          class="context-menu-item"
          onSelect={handleSelect(onrename)}
        >
          <span class="context-menu-label">Rename</span>
        </ContextMenu.Item>
      {/if}

      {#if onduplicate}
        <ContextMenu.Item
          class="context-menu-item"
          onSelect={handleSelect(onduplicate)}
        >
          <span class="context-menu-label">Duplicate Rack</span>
        </ContextMenu.Item>
      {/if}

      {#if ondelete && (onexport || onfocus || onedit || onrename || onduplicate)}
        <ContextMenu.Separator class="context-menu-separator" />
      {/if}

      {#if ondelete}
        <ContextMenu.Item
          class="context-menu-item context-menu-item--destructive"
          onSelect={handleSelect(ondelete)}
        >
          <span class="context-menu-label">Delete Rack</span>
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
