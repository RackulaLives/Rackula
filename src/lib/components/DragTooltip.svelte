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

  // Height calculation: base + (uHeight - 1) * perU, minimum 24px
  // Base: 24px (--space-6), Per U: 14px (--space-3-5)
  const BASE_HEIGHT = 24;
  const HEIGHT_PER_U = 14;
  const tooltipHeight = $derived(
    Math.max(BASE_HEIGHT, BASE_HEIGHT + (uHeight - 1) * HEIGHT_PER_U),
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
    width: 160px;
    padding: var(--space-1) var(--space-3);
    background-color: var(--colour-surface-overlay, rgba(0, 0, 0, 0.9));
    color: var(--colour-text-inverse, white);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    border-left: 4px solid var(--colour-primary);
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
    max-width: 140px;
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
