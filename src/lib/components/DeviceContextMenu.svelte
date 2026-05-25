<!--
  DeviceContextMenu Component
  Right-click context menu for placed devices in racks.
  Uses bits-ui ContextMenu with dark overlay styling matching ToolbarMenu.

  Supports two modes:
  1. Wrapper mode: Pass children snippet to wrap an element as the trigger
  2. Virtual trigger mode: Pass x/y coordinates for SVG/programmatic use
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
    /**
     * Trigger element (the device) - for wrapper mode.
     * Omit when using virtual trigger mode with x/y coordinates.
     */
    children?: Snippet;
    /**
     * X coordinate for virtual trigger (screen position).
     * Use with y prop for SVG elements that can't be wrapped.
     */
    x?: number;
    /**
     * Y coordinate for virtual trigger (screen position).
     * Use with x prop for SVG elements that can't be wrapped.
     */
    y?: number;
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
    x,
    y,
  }: Props = $props();

  // Virtual trigger mode: x and y are provided, children is not
  const useVirtualTrigger = $derived(x !== undefined && y !== undefined);

  // Anchor the menu to the cursor's viewport coordinates via a Measurable
  // virtual element. We can't anchor to a positioned DOM element here: the
  // menu is rendered inside the panzoom container whose CSS `transform`
  // re-bases `position: fixed`, so a fixed trigger div lands in the wrong
  // place (and bits-ui otherwise defaults the menu to the top-left origin).
  const virtualAnchor = $derived(
    useVirtualTrigger
      ? { getBoundingClientRect: () => new DOMRect(x ?? 0, y ?? 0, 0, 0) }
      : null,
  );

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
  {#if useVirtualTrigger}
    <!-- Virtual trigger mode: the menu is opened programmatically and
         positioned via customAnchor below, so no trigger element is needed. -->
    <ContextMenu.Trigger />
  {:else if children}
    <ContextMenu.Trigger>
      {@render children()}
    </ContextMenu.Trigger>
  {/if}

  <ContextMenu.Portal>
    <ContextMenu.Content
      class="context-menu-content"
      sideOffset={5}
      customAnchor={virtualAnchor}
    >
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
