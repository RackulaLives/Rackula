<!--
  Sidebar Component
  Fixed sidebar that's always visible (no toggle)
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    side: "left" | "right";
    title?: string;
    collapsed?: boolean;
    children?: Snippet;
  }

  let { side, title, collapsed = false, children }: Props = $props();
</script>

<aside
  class="sidebar sidebar-{side}"
  class:collapsed
  aria-label={title ?? "Sidebar"}
  aria-expanded={!collapsed}
>
  {#if title}
    <div class="sidebar-header">
      <h2 class="sidebar-title">{title}</h2>
    </div>
  {/if}
  <div class="sidebar-content">
    {#if children}
      {@render children()}
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    position: fixed;
    top: var(--toolbar-height);
    bottom: 0;
    width: var(--sidebar-width);
    background: var(--colour-sidebar-bg);
    border-right: 1px solid var(--colour-border);
    display: flex;
    flex-direction: column;
    z-index: var(--z-sidebar);
    transition: width var(--duration-normal) var(--ease-out);
    will-change: width;
  }

  /* Collapsed state */
  .sidebar.collapsed {
    overflow: hidden;
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }

  .sidebar-left {
    left: 0;
    border-right: 1px solid var(--colour-border);
    border-left: none;
  }

  .sidebar-right {
    right: 0;
    border-left: 1px solid var(--colour-border);
    border-right: none;
  }

  .sidebar-header {
    padding: var(--space-4);
    border-bottom: 1px solid var(--colour-border);
    flex-shrink: 0;
  }

  .sidebar-title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--colour-text);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
