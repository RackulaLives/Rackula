<!--
  CanvasContextMenu Component
  Right-click context menu for empty canvas areas.
  Uses bits-ui ContextMenu with dark overlay styling matching ToolbarMenu.
-->
<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import type { Snippet } from "svelte";
  import { DISPLAY_MODE_LABELS, type DisplayMode } from "$lib/types";
  import "$lib/styles/context-menus.css";

  interface Props {
    /** Whether the menu is open */
    open?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
    /** New rack callback */
    onnewrack?: () => void;
    /** Fit all racks in view callback */
    onfitall?: () => void;
    /** Reset zoom to 100% callback */
    onresetzoom?: () => void;
    /** Current display mode, used to label the toggle entry */
    displayMode?: DisplayMode;
    /** Cycle the canvas display mode (label -> image -> image-label) */
    ontoggledisplaymode?: () => void;
    /** Trigger element (the canvas) */
    children: Snippet;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    onnewrack,
    onfitall,
    onresetzoom,
    displayMode,
    ontoggledisplaymode,
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
      <ContextMenu.Item
        class="context-menu-item"
        data-testid="ctx-menu-item"
        onSelect={handleSelect(onnewrack)}
      >
        <span class="context-menu-label">New Rack</span>
      </ContextMenu.Item>

      <ContextMenu.Separator class="context-menu-separator" />

      <ContextMenu.Item
        class="context-menu-item"
        data-testid="ctx-menu-item"
        onSelect={handleSelect(onfitall)}
      >
        <span class="context-menu-label">Fit All</span>
        <span class="context-menu-shortcut">F</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        data-testid="ctx-menu-item"
        onSelect={handleSelect(onresetzoom)}
      >
        <span class="context-menu-label">Reset Zoom</span>
      </ContextMenu.Item>

      {#if ontoggledisplaymode}
        <ContextMenu.Separator class="context-menu-separator" />

        <ContextMenu.Item
          class="context-menu-item"
          data-testid="ctx-menu-item"
          onSelect={handleSelect(ontoggledisplaymode)}
        >
          <span class="context-menu-label">
            Display{displayMode ? `: ${DISPLAY_MODE_LABELS[displayMode]}` : ""}
          </span>
          <span class="context-menu-shortcut">I</span>
        </ContextMenu.Item>
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>

<style>
  /*
   * bits-ui ContextMenu.Trigger creates a wrapper div that must fill its parent.
   * Target by DOM position: the trigger div directly wrapping .canvas.
   *
   * Desktop: .canvas-region > div > .canvas (canvas sits beside the side panel)
   * Mobile:  .app-main > div > .canvas (Canvas is a direct child of <main>)
   *
   * Without this, the wrapper collapses to its content's intrinsic size and
   * .canvas { flex: 1 } resolves against the small wrapper instead of the
   * full parent, so the canvas does not fill the window. min-width: 0 closes
   * the same gap on the horizontal axis: without it, the wrapper's default
   * min-width: auto lets wide rack content stretch it past the mobile
   * viewport, pushing full-bleed overlays like PlacementIndicator off
   * screen (#2991).
   */
  :global(.canvas-region > div:has(> .canvas)),
  :global(.app-main > div:has(> .canvas)) {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }
</style>
