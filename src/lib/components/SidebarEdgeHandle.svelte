<!--
  SidebarEdgeHandle Component
  Visible edge handle when sidebar is collapsed - allows drag or double-click to expand
-->
<script lang="ts">
  import { pointerCapture } from "$lib/utils/pointer-capture";

  interface Props {
    onexpand: () => void;
  }

  let { onexpand }: Props = $props();

  let isDragging = $state(false);
  let dragStartX = $state(0);

  function handleDoubleClick() {
    onexpand();
  }

  function handlePointerDown(event: PointerEvent) {
    if (!event.isPrimary) return;
    isDragging = true;
    dragStartX = event.clientX;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isDragging) return;

    const deltaX = event.clientX - dragStartX;
    // If dragged right more than 30px, expand the sidebar
    if (deltaX > 30) {
      isDragging = false;
      onexpand();
    }
  }

  function handlePointerUp() {
    isDragging = false;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div
  class="sidebar-edge-handle"
  class:dragging={isDragging}
  role="separator"
  aria-label="Expand sidebar"
  tabindex="0"
  ondblclick={handleDoubleClick}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onexpand();
    }
  }}
  use:pointerCapture
>
  <div class="edge-notch" aria-hidden="true">
    <span class="notch-icon">›</span>
  </div>
</div>

<style>
  .sidebar-edge-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 12px;
    cursor: col-resize;
    z-index: var(--z-sidebar);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    transition: background var(--duration-fast) var(--ease-out);
    touch-action: none;
    user-select: none;
  }

  .sidebar-edge-handle:hover,
  .sidebar-edge-handle.dragging {
    background: var(
      --colour-selection-muted,
      rgba(var(--colour-selection-rgb), 0.15)
    );
  }

  .sidebar-edge-handle:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  .edge-notch {
    width: 8px;
    height: 48px;
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-left: none;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-out);
  }

  .sidebar-edge-handle:hover .edge-notch,
  .sidebar-edge-handle.dragging .edge-notch {
    background: var(--colour-surface-hover);
    width: 12px;
  }

  .notch-icon {
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
    transition: color var(--duration-fast) var(--ease-out);
  }

  .sidebar-edge-handle:hover .notch-icon,
  .sidebar-edge-handle.dragging .notch-icon {
    color: var(--colour-text);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .sidebar-edge-handle,
    .edge-notch,
    .notch-icon {
      transition: none;
    }
  }
</style>
