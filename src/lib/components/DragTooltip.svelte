<!--
  DragTooltip Component
  Shows device name during drag operations with rack-slot proportioned sizing.
  Height hints at U-height, category color accent on left border.

  Issue #306: feat: drag tooltip showing device name and U-height
-->
<script lang="ts">
  import { getDragTooltipState } from "$lib/stores/dragTooltip.svelte";

  // Get reactive tooltip state from store
  const tooltipState = $derived(getDragTooltipState());
  const device = $derived(tooltipState.device);
  const x = $derived(tooltipState.x);
  const y = $derived(tooltipState.y);
  const visible = $derived(tooltipState.visible);
  const categoryColor = $derived(tooltipState.categoryColor);
  const uHeight = $derived(tooltipState.uHeight);

  // Device display name: model or slug
  const deviceName = $derived(device?.model ?? device?.slug ?? "Device");

  // Height calculation: base + (uHeight - 1) * perU
  // Values match design tokens: --drag-tooltip-base-height (24px), --drag-tooltip-height-per-u (14px)
  const BASE_HEIGHT_PX = 24; // --drag-tooltip-base-height = --space-6
  const HEIGHT_PER_U_PX = 14; // --drag-tooltip-height-per-u = 0.875rem
  const tooltipHeight = $derived(
    Math.max(BASE_HEIGHT_PX, BASE_HEIGHT_PX + (uHeight - 1) * HEIGHT_PER_U_PX),
  );
</script>

{#if visible && device}
  <div
    class="drag-tooltip"
    role="tooltip"
    aria-live="polite"
    style="
      left: {x}px;
      top: {y}px;
      height: {tooltipHeight}px;
      border-left-color: {categoryColor};
    "
  >
    <span class="device-name">{deviceName}</span>
  </div>
{/if}

<style>
  .drag-tooltip {
    position: fixed;
    z-index: var(--z-tooltip, 1000);
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--drag-tooltip-width, 160px);
    padding: var(--space-1) var(--space-3);
    background-color: var(--colour-surface-overlay, rgba(0, 0, 0, 0.9));
    color: var(--colour-text-inverse, white);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    border-left: var(--drag-tooltip-border-width, var(--space-1)) solid
      var(--colour-primary);
    pointer-events: none;
    box-shadow: var(--shadow-lg);
    animation: drag-tooltip-fade-in var(--duration-fast, 100ms)
      var(--ease-out, ease-out);
  }

  @keyframes drag-tooltip-fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .device-name {
    font-weight: var(--font-weight-medium, 500);
    max-width: var(--drag-tooltip-max-width, 140px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .drag-tooltip {
      animation: none;
    }
  }
</style>
