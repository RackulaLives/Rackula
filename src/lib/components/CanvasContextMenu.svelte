<!--
  CanvasContextMenu Component
  Right-click context menu for empty canvas areas.
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
    /** New rack callback */
    onnewrack?: () => void;
    /** Fit all racks in view callback */
    onfitall?: () => void;
    /** Reset zoom to 100% callback */
    onresetzoom?: () => void;
    /** Toggle theme callback */
    ontoggletheme?: () => void;
    /** Current theme (for label) */
    theme?: "dark" | "light";
    /** Trigger element (the canvas) */
    children: Snippet;
  }

  let {
    open = $bindable(false),
    onOpenChange,
    onnewrack,
    onfitall,
    onresetzoom,
    ontoggletheme,
    theme = "dark",
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
        onSelect={handleSelect(onnewrack)}
      >
        <span class="context-menu-label">New Rack</span>
      </ContextMenu.Item>

      <ContextMenu.Separator class="context-menu-separator" />

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onfitall)}
      >
        <span class="context-menu-label">Fit All</span>
        <span class="context-menu-shortcut">F</span>
      </ContextMenu.Item>

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(onresetzoom)}
      >
        <span class="context-menu-label">Reset Zoom</span>
      </ContextMenu.Item>

      <ContextMenu.Separator class="context-menu-separator" />

      <ContextMenu.Item
        class="context-menu-item"
        onSelect={handleSelect(ontoggletheme)}
      >
        <span class="context-menu-label"
          >{theme === "dark" ? "Light" : "Dark"} Theme</span
        >
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
