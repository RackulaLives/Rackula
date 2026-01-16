<!--
  Drawer Component
  Slide-in drawer panel for left and right sides
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import DrawerHeader from "./DrawerHeader.svelte";

  interface Props {
    side: "left" | "right";
    open: boolean;
    title: string;
    id?: string;
    showClose?: boolean;
    showHeader?: boolean;
    onclose?: () => void;
    children?: Snippet;
  }

  let {
    side,
    open,
    title,
    id,
    showClose = true,
    showHeader = true,
    onclose,
    children,
  }: Props = $props();
</script>

<aside
  {id}
  class="drawer drawer-{side}"
  class:open
  aria-label={title}
  aria-hidden={!open}
>
  {#if showHeader}
    <DrawerHeader {title} {showClose} {onclose} />
  {/if}
  <div class="drawer-content">
    {#if children}
      {@render children()}
    {/if}
  </div>
</aside>

<style>
  .drawer {
    position: fixed;
    top: var(--toolbar-height);
    bottom: 0;
    width: var(--drawer-width);
    background: var(--drawer-bg);
    border: 1px solid var(--colour-border);
    display: flex;
    flex-direction: column;
    transition: transform var(--transition-normal);
    z-index: var(--z-drawer);
  }

  .drawer-left {
    left: 0;
    border-left: none;
    transform: translateX(-100%);
  }

  .drawer-right {
    right: 0;
    border-right: none;
    transform: translateX(100%);
  }

  .drawer-left.open {
    transform: translateX(0);
  }

  .drawer-right.open {
    transform: translateX(0);
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  }
</style>
