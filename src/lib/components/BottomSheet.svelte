<!--
  BottomSheet Component
  Slide-up modal for mobile device details with swipe-to-dismiss gesture
-->
<script lang="ts">
  interface Props {
    open: boolean;
    onclose?: () => void;
    children?: import("svelte").Snippet;
  }

  let { open = $bindable(false), onclose, children }: Props = $props();

  let sheetElement: HTMLDivElement | null = $state(null);
  let startY = $state(0);
  let currentY = $state(0);
  let isDragging = $state(false);

  // Transform value for dragging (positive = dragging down)
  const translateY = $derived(isDragging ? Math.max(0, currentY - startY) : 0);

  // Close threshold: if dragged down more than 100px, close on release
  const CLOSE_THRESHOLD = 100;

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeSheet();
    }
  }

  function closeSheet() {
    open = false;
    onclose?.();
  }

  // Swipe-to-dismiss gesture handlers
  function handlePointerDown(event: PointerEvent) {
    // Only handle touch/pen events on the sheet itself
    if (event.pointerType === "mouse") return;

    startY = event.clientY;
    currentY = event.clientY;
    isDragging = true;

    // Capture pointer for smooth tracking
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isDragging) return;
    currentY = event.clientY;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!isDragging) return;

    const dragDistance = currentY - startY;

    // Close if dragged down past threshold
    if (dragDistance > CLOSE_THRESHOLD) {
      closeSheet();
    }

    isDragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }

  function handlePointerCancel(event: PointerEvent) {
    isDragging = false;
    if (event.currentTarget) {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    }
  }

  // Handle Escape key to close
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      closeSheet();
    }
  }

  // Prevent body scroll when sheet is open
  $effect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
  <div
    class="bottom-sheet-container"
    onclick={handleBackdropClick}
    onkeydown={(e) =>
      e.key === "Enter" && handleBackdropClick(e as unknown as MouseEvent)}
    role="button"
    tabindex="-1"
  >
    <!-- Backdrop -->
    <div class="backdrop" class:visible={open}></div>

    <!-- Sheet -->
    <div
      bind:this={sheetElement}
      class="bottom-sheet"
      class:open
      class:dragging={isDragging}
      style:transform={isDragging ? `translateY(${translateY}px)` : ""}
      role="dialog"
      aria-modal="true"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerCancel}
    >
      <!-- Drag handle -->
      <div class="drag-handle">
        <div class="drag-handle-bar"></div>
      </div>

      <!-- Content -->
      <div class="sheet-content">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .bottom-sheet-container {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: flex-end;
    pointer-events: all;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop {
      transition: none;
    }
  }

  .backdrop.visible {
    opacity: 1;
  }

  .bottom-sheet {
    position: relative;
    width: 100%;
    max-height: 80vh;
    background: var(--color-bg);
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    touch-action: pan-y;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @media (prefers-reduced-motion: reduce) {
    .bottom-sheet {
      transition: none;
    }
  }

  .bottom-sheet.open {
    transform: translateY(0);
  }

  .bottom-sheet.dragging {
    transition: none;
  }

  .drag-handle {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: var(--touch-target-min);
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }

  .drag-handle-bar {
    width: 2.5rem;
    height: 0.25rem;
    background: var(--color-text-secondary);
    opacity: 0.4;
    border-radius: 0.125rem;
  }

  .sheet-content {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 1.5rem 1.5rem;
  }

  /* Scrollbar styling */
  .sheet-content::-webkit-scrollbar {
    width: 0.5rem;
  }

  .sheet-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .sheet-content::-webkit-scrollbar-thumb {
    background: var(--color-text-secondary);
    opacity: 0.3;
    border-radius: 0.25rem;
  }
</style>
