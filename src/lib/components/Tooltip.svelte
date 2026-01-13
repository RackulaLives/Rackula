<!--
  Tooltip Component
  Shows contextual information on hover/focus with optional keyboard shortcut.
  Uses bits-ui Tooltip for proper ARIA support and collision detection.

  IMPORTANT: Mobile behavior
  bits-ui tooltips are intentionally unsupported on touch devices because hover
  doesn't exist on touch. This is a deliberate UX decision - tooltip content
  should be non-essential information that can be discovered via other means.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Tooltip } from "bits-ui";

  type Position = "top" | "bottom" | "left" | "right";

  interface Props {
    text: string;
    shortcut?: string;
    position?: Position;
    children?: Snippet;
  }

  let { text, shortcut, position = "top", children }: Props = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger class="tooltip-trigger">
    {#if children}
      {@render children()}
    {/if}
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      class="tooltip-content"
      side={position}
      sideOffset={4}
      avoidCollisions={true}
    >
      <span class="tooltip-text">{text}</span>
      {#if shortcut}
        <span class="tooltip-shortcut">{shortcut}</span>
      {/if}
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>

<style>
  :global(.tooltip-trigger) {
    /* Reset button-like styling for trigger wrapper */
    display: inline-flex;
    background: transparent;
    border: none;
    padding: 0;
    cursor: inherit;
  }

  :global(.tooltip-content) {
    z-index: var(--z-tooltip, 1000);
    padding: var(--space-1) var(--space-2);
    background-color: var(--colour-surface-overlay);
    color: var(--colour-text-inverse);
    font-size: var(--font-size-xs);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: var(--shadow-md);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    animation: tooltip-fade-in var(--duration-fast, 100ms)
      var(--ease-out, ease-out);
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  :global(.tooltip-text) {
    color: inherit;
  }

  :global(.tooltip-shortcut) {
    padding: 1px 4px;
    background-color: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-muted-inverse, rgba(255, 255, 255, 0.7));
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    :global(.tooltip-content) {
      animation: none;
    }
  }
</style>
