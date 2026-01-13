<!--
  DragTooltip Component
  Shows device name and U-height during drag operations.
  Follows the cursor position to provide immediate context during placement.

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

  // Device display name: model or slug
  const deviceName = $derived(device?.model ?? device?.slug ?? "Device");
</script>

{#if visible && device}
  <div
    class="drag-tooltip"
    role="tooltip"
    aria-live="polite"
    style="left: {x}px; top: {y}px;"
  >
    <span class="device-name">{deviceName}</span>
    <span class="device-height">{device.u_height}U</span>
  </div>
{/if}

<style>
  .drag-tooltip {
    position: fixed;
    z-index: var(--z-tooltip, 1000);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1-5) var(--space-3);
    background-color: var(--colour-surface-overlay, rgba(0, 0, 0, 0.9));
    color: var(--colour-text-inverse, white);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-md);
    pointer-events: none;
    box-shadow: var(--shadow-lg);
    white-space: nowrap;
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
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .device-height {
    background-color: var(--colour-surface-active, rgba(255, 255, 255, 0.15));
    padding: var(--space-0-5) var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--colour-primary, #8be9fd);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .drag-tooltip {
      animation: none;
    }
  }
</style>
