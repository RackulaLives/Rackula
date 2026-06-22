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

  interface BaseProps {
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
  }

  /**
   * Exactly one trigger source. A discriminated union so passing both, or
   * neither, is a compile-time error rather than a silently empty trigger.
   * - `children`: the trigger content, wrapped in bits-ui's default trigger
   *   div. Use for canvas triggers that are not inside a role that constrains
   *   its children.
   * - `trigger`: bits-ui render delegation. Receives the trigger `props` to
   *   spread onto your own root element, with no wrapper. Use when the trigger
   *   sits inside a `list` (the Racks panel rows), so a roleless, focusable
   *   wrapper between the `list` and its `listitem` does not break
   *   aria-required-children (#2254).
   */
  type TriggerProps =
    | { children: Snippet; trigger?: never }
    | { trigger: Snippet<[Record<string, unknown>]>; children?: never };

  type Props = BaseProps & TriggerProps;

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
    trigger,
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
    {#snippet child({ props })}
      {#if trigger}
        {@render trigger(props)}
      {:else}
        <div {...props}>
          {@render children?.()}
        </div>
      {/if}
    {/snippet}
  </ContextMenu.Trigger>

  <ContextMenu.Portal>
    <ContextMenu.Content
      class="context-menu-content"
      data-testid="ctx-menu"
      sideOffset={5}
    >
      {#if onexport}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(onexport)}
        >
          <span class="context-menu-label">Export...</span>
        </ContextMenu.Item>
      {/if}

      {#if onfocus}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-focus"
          onSelect={handleSelect(onfocus)}
        >
          <span class="context-menu-label">Focus</span>
        </ContextMenu.Item>
      {/if}

      {#if onedit}
        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(onedit)}
        >
          <span class="context-menu-label">Edit Rack</span>
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
          <span class="context-menu-label">Duplicate Rack</span>
        </ContextMenu.Item>
      {/if}

      {#if ondelete && (onexport || onfocus || onedit || onrename || onduplicate)}
        <ContextMenu.Separator class="context-menu-separator" />
      {/if}

      {#if ondelete}
        <ContextMenu.Item
          class="context-menu-item context-menu-item--destructive"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(ondelete)}
        >
          <span class="context-menu-label">Delete Rack</span>
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
