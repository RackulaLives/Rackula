<!--
  Tooltip Component
  Shows contextual information on hover/focus with optional keyboard shortcut.
  Uses bits-ui Tooltip for proper ARIA support and collision detection.

  IMPORTANT: Mobile behavior
  bits-ui tooltips are intentionally unsupported on touch devices because hover
  doesn't exist on touch. This is a deliberate UX decision - tooltip content
  should be non-essential information that can be discovered via other means.

  Trigger markup
  When the tooltip wraps content that is itself interactive (a button, a link),
  pass a `triggerChild` snippet: it receives the trigger `props` and spreads
  them onto that element so the element IS the trigger. That avoids nesting an
  interactive element inside the default trigger button, which fails the axe
  `nested-interactive` rule and confuses keyboard focus order (#2255). When the
  content is static (an icon, a status glyph), use the default `children`
  snippet and bits-ui renders its own trigger button.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Tooltip } from "bits-ui";

  type Position = "top" | "bottom" | "left" | "right";
  type TriggerProps = Record<string, unknown>;

  interface Props {
    text: string;
    shortcut?: string;
    position?: Position;
    /** Static trigger content; bits-ui renders its own trigger button. */
    children?: Snippet;
    /**
     * Interactive trigger content. Receives the trigger `props` to spread onto
     * your own element so it becomes the trigger (no wrapper button).
     */
    triggerChild?: Snippet<[{ props: TriggerProps }]>;
  }

  let {
    text,
    shortcut,
    position = "top",
    children,
    triggerChild,
  }: Props = $props();
</script>

<Tooltip.Root>
  {#if triggerChild}
    <Tooltip.Trigger>
      {#snippet child({ props })}
        {@render triggerChild({ props })}
      {/snippet}
    </Tooltip.Trigger>
  {:else}
    <Tooltip.Trigger class="tooltip-trigger">
      {#if children}
        {@render children()}
      {/if}
    </Tooltip.Trigger>
  {/if}
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
    background-color: var(--colour-shortcut-bg);
    border-radius: 2px;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono, monospace);
    color: var(--colour-text-muted-inverse);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    :global(.tooltip-content) {
      animation: none;
    }
  }
</style>
